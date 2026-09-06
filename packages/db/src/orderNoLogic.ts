/**
 * `order_no` allocation — the arithmetic and retry decision, BUILD-PLAN.md
 * §5.6; docs/runfiles/M14-storefront.md §3.
 *
 * Split out of `orderNo.ts` (which carries the database read) so this half —
 * no database, no framework — can be unit-tested directly, the same split
 * `businessDateLogic.ts` makes and for the identical reason (a `server-only`
 * import cannot resolve under vitest outside a React Server Component
 * context).
 *
 * Lives in `packages/db`, not an app's own `lib/`, because both `apps/pos`
 * (a POS order) and `apps/storefront` (a web order) insert into the one
 * `orders` table and must agree on this exact collision-and-retry rule —
 * two independent copies risks the one thing this design exists to prevent:
 * a duplicate `order_no` on the same business date.
 *
 * Unlike `check_no`/`local_no` (`packages/db/src/counters.ts`), there is no
 * `order_counter` singleton row to lock `FOR UPDATE`. `order_no` is not a
 * fiscal number — nothing in §6–§7 reads it, it resets daily, and a gap in it
 * has no compliance meaning, unlike a gap in `local_no` (R9, §5.8). That is
 * the deliberate reason for choosing the cheaper of the two designs available:
 *
 *   read `MAX(order_no)` for today's business date inside the transaction
 *   (`orderNo.ts`'s `readMaxOrderNo`), insert `MAX + 1`, and if that loses a
 *   race to a concurrent send (caught as a violation of
 *   `orders_business_date_no_idx`), retry the attempt exactly once.
 *
 * A `FOR UPDATE`-locked singleton counter would serialise every order on one
 * row across every till in the building for a number nobody outside the
 * floor ever needs to be gap-free — the right trade for `local_no`, the
 * wrong one here. Retrying more than once would mask a real bug (a stampede
 * of concurrent sends on the same business date is not the expected shape of
 * a single restaurant's traffic) rather than absorb an honest one-off race.
 */

/** Pure — the arithmetic half of the decision, independent of the database read. */
export function nextOrderNoFrom(maxExisting: number | null): number {
  return (maxExisting ?? 0) + 1;
}

/**
 * True when `error` is the partial-unique index on `(business_date, order_no)`
 * refusing a collision — the one and only signal that a retry is warranted,
 * as opposed to any other failure inside the same transaction.
 *
 * Drizzle wraps the driver error (CLAUDE.md's traps): the Postgres message
 * naming the failing constraint is on `error.cause`, not `error.message`.
 */
export function isOrderNoConflict(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : undefined;
  const message = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : '';
  return message.includes('orders_business_date_no_idx');
}

/**
 * Run `attempt` once, and exactly once more if it fails on the order-number
 * collision — never for any other error, which is left to propagate. Split out
 * from the transaction it wraps so the retry decision is unit-testable against
 * a fake `attempt` rather than only provable against a live database race.
 */
export async function withOrderNoRetry<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    if (!isOrderNoConflict(error)) throw error;
    return attempt();
  }
}
