/**
 * @natech/db — Drizzle schema, migrations, clients, seeds.
 *
 * BUILD-PLAN.md §5.
 *
 * Two clients that are NOT interchangeable (R2):
 *   dbWrite  Neon WebSocket Pool. Every write. Honours transactions.
 *   dbRead   Neon HTTP driver. RSC reads only. Silently no-ops a
 *            multi-statement transaction, which is why the
 *            `natech/r2-no-dbread-in-mutations` config bans it from actions
 *            and mutation route handlers.
 */

export { closeDb, dbRead, dbWrite, type DbRead, type DbWrite } from './client';
export type { Tx } from './tx';
export { databaseUrls, type DatabaseUrls } from './env';

export { withAudit, writeAudit, type AuditContext, type AuditEntry } from './audit';
export { withIdempotency, type IdempotencyOutcome } from './idempotency';
export { allocateLocalNo } from './counters';
export { isOrderNoConflict, nextOrderNoFrom, readMaxOrderNo, withOrderNoRetry } from './orderNo';
export {
  authAttemptHistory,
  recordAuthAttempt,
  type AuthAttemptEntry,
  type AuthAttemptHistory,
  type AuthAttemptKind,
} from './auth-attempts';

export * from './schema';
