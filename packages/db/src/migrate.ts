import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import { closeDb, dbWrite } from './client';

/**
 * Apply committed migrations. BUILD-PLAN.md §2 R8.
 *
 * Runs the reviewed SQL in `drizzle/`, in order, inside a transaction — which
 * is why it goes through `dbWrite`. The HTTP driver would no-op it silently.
 *
 * There is deliberately no `push` script anywhere in this package.
 */
async function main(): Promise<void> {
  const db = dbWrite();
  console.warn('applying migrations from ./drizzle');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.warn('migrations applied');
  await closeDb();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
