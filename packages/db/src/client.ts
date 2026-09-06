import { neon, neonConfig, Pool } from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzleWs } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import { databaseUrls } from './env';
import * as schema from './schema';

/**
 * The two database clients — BUILD-PLAN.md §2 R2.
 *
 * These are separate exports rather than one client with a flag, deliberately.
 * The distinction is not a performance tuning knob: the HTTP driver **silently
 * no-ops a multi-statement transaction**. A finalize that allocates `local_no`,
 * inserts the invoice, writes tax lines, and enqueues the outbox would appear to
 * succeed and persist none of it. Nothing throws, and the loss is discovered at
 * reconciliation.
 *
 * `dbWrite` — WebSocket pooled. Every write. Honours transactions.
 * `dbRead`  — HTTP. React Server Component reads only.
 *
 * The `natech/r2-no-dbread-in-mutations` config bans importing `dbRead` from
 * `**\/actions\/**` and mutation route handlers, so the mistake is caught at
 * edit time as well as documented here.
 */

// Node has no global WebSocket that the pooled driver can use. In a serverless
// runtime this is already provided.
if (typeof globalThis.WebSocket === 'undefined') {
  neonConfig.webSocketConstructor = ws;
}

let writeClient: ReturnType<typeof drizzleWs<typeof schema>> | undefined;
let readClient: ReturnType<typeof drizzleHttp<typeof schema>> | undefined;
let pool: Pool | undefined;

/** Every write. Transactional. */
export function dbWrite(): ReturnType<typeof drizzleWs<typeof schema>> {
  if (writeClient === undefined) {
    pool = new Pool({ connectionString: databaseUrls().write });
    writeClient = drizzleWs({ client: pool, schema, casing: 'snake_case' });
  }
  return writeClient;
}

/** RSC reads only. Never a mutation. */
export function dbRead(): ReturnType<typeof drizzleHttp<typeof schema>> {
  if (readClient === undefined) {
    readClient = drizzleHttp({
      client: neon(databaseUrls().read),
      schema,
      casing: 'snake_case',
    });
  }
  return readClient;
}

/** Close the pool. For scripts and tests; a serverless runtime does not call it. */
export async function closeDb(): Promise<void> {
  if (pool !== undefined) {
    await pool.end();
    pool = undefined;
    writeClient = undefined;
  }
}

export type DbWrite = ReturnType<typeof dbWrite>;
export type DbRead = ReturnType<typeof dbRead>;
