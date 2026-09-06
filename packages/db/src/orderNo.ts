import { and, eq, isNull, sql } from 'drizzle-orm';
import { orders } from './schema';
import type { Tx } from './tx';

export { isOrderNoConflict, nextOrderNoFrom, withOrderNoRetry } from './orderNoLogic';

/**
 * `MAX(order_no)` for a business date, or `null` if nothing has been placed
 * yet — the one half of `order_no` allocation (see `orderNoLogic.ts`'s doc
 * comment for the design) that needs the database, and so is untested
 * directly; `orderNoLogic.test.ts` covers the rest.
 */
export async function readMaxOrderNo(tx: Tx, businessDate: string): Promise<number | null> {
  const rows = await tx
    .select({ maxNo: sql<number | string | null>`max(${orders.orderNo})` })
    .from(orders)
    .where(and(eq(orders.businessDate, businessDate), isNull(orders.deletedAt)));

  const raw = rows[0]?.maxNo ?? null;
  // CLAUDE.md's trap: a raw SQL aggregate can round-trip as a string rather
  // than the number a mapped column would give. Coerced here, at the boundary,
  // the same discipline `authAttemptHistory` applies to a timestamptz MAX.
  return raw === null ? null : Number(raw);
}
