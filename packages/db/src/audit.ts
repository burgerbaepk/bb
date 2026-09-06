import { auditLog } from './schema';
import type { Tx } from './tx';

/**
 * R7 — an audit row for every mutation. BUILD-PLAN.md §2 R7, §5.2.
 *
 * PSTSA s.32(2) grants an officer full access to electronic records, and s.32(1)
 * requires six years of retention. "Who changed this price, and when" has to be
 * answerable years later, by someone who does not have the application.
 *
 * The audit write happens inside the caller's transaction on purpose. An audit
 * row that can be committed while its mutation rolls back — or the reverse — is
 * worse than none, because it is believed.
 */
export interface AuditContext {
  readonly actorId?: string | undefined;
  readonly ip?: string | undefined;
  readonly ua?: string | undefined;
}

export interface AuditEntry {
  readonly entity: string;
  readonly entityId?: string | undefined;
  readonly action: string;
  readonly before?: unknown;
  readonly after?: unknown;
}

/**
 * Convert an audit snapshot to a value PostgreSQL JSONB can encode.
 *
 * Monetary columns are represented as bigint in application code, but native
 * JSON has no bigint representation. Persist them as decimal strings so audit
 * writes cannot roll back an otherwise-valid business mutation and no
 * precision is lost by coercing them to number.
 */
export function auditJson(value: unknown): unknown {
  const encoded = JSON.stringify(value, (_key, nestedValue: unknown) =>
    typeof nestedValue === 'bigint' ? nestedValue.toString() : nestedValue,
  );

  return encoded === undefined ? null : JSON.parse(encoded);
}

export async function writeAudit(tx: Tx, ctx: AuditContext, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLog).values({
    actorId: ctx.actorId ?? null,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    action: entry.action,
    before: entry.before === undefined ? null : (auditJson(entry.before) as object),
    after: entry.after === undefined ? null : (auditJson(entry.after) as object),
    ip: ctx.ip ?? null,
    ua: ctx.ua ?? null,
  });
}

/**
 * Run a mutation and record it. The audit row is written from the same
 * transaction, after the work, so a rolled-back mutation leaves no trace
 * claiming it happened.
 */
export async function withAudit<T>(
  tx: Tx,
  ctx: AuditContext,
  spec: { entity: string; entityId?: string | undefined; action: string; before?: unknown },
  fn: () => Promise<{ result: T; after?: unknown; entityId?: string }>,
): Promise<T> {
  const { result, after, entityId } = await fn();

  await writeAudit(tx, ctx, {
    entity: spec.entity,
    entityId: entityId ?? spec.entityId,
    action: spec.action,
    before: spec.before,
    after,
  });

  return result;
}
