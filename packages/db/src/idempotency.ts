import { eq } from 'drizzle-orm';
import { idempotencyKeys } from './schema';
import type { Tx } from './tx';

/**
 * R3 — an idempotency key on every multi-row mutation. BUILD-PLAN.md §2 R3, §8.
 *
 * The case this exists for: a till finalizes an invoice, the response is lost on
 * a flaky connection, and the cashier presses the button again. Without this the
 * customer is charged twice and two fiscal documents are transmitted, which then
 * need a credit note to unwind.
 *
 * It matters more offline (§8). Queued orders replay to `POST /api/sync/orders`
 * using `client_order_uuid` as the key, and a replay that runs twice would
 * duplicate a whole day of trade.
 *
 * The stored result is returned verbatim on a repeat, so the second caller sees
 * exactly what the first one did.
 */
export interface IdempotencyOutcome<T> {
  readonly result: T;
  /** True when this call did the work; false when a previous one had. */
  readonly executed: boolean;
}

export async function withIdempotency<T>(
  tx: Tx,
  key: string,
  scope: string,
  fn: () => Promise<T>,
): Promise<IdempotencyOutcome<T>> {
  // Claim the key first. The unique index is what makes this safe under
  // concurrency: two simultaneous callers race here, and exactly one wins.
  const claimed = await tx
    .insert(idempotencyKeys)
    .values({ key, scope })
    .onConflictDoNothing({ target: idempotencyKeys.key })
    .returning({ id: idempotencyKeys.id });

  if (claimed.length === 0) {
    const [existing] = await tx
      .select({ result: idempotencyKeys.result, scope: idempotencyKeys.scope })
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, key));

    if (existing === undefined) {
      // The row vanished between the conflict and the read. Only possible if
      // something deleted it concurrently, which nothing should.
      throw new Error(`idempotency key ${key} conflicted but could not be read back`);
    }

    if (existing.scope !== scope) {
      throw new Error(
        `idempotency key ${key} was used for scope "${existing.scope}" and is now being reused ` +
          `for "${scope}". A key belongs to one operation.`,
      );
    }

    return { result: existing.result as T, executed: false };
  }

  const result = await fn();

  await tx
    .update(idempotencyKeys)
    .set({ result: result as object, updatedAt: new Date() })
    .where(eq(idempotencyKeys.key, key));

  return { result, executed: true };
}
