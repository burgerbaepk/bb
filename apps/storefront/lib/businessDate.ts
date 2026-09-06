import 'server-only';
import { eq } from 'drizzle-orm';
import { outletConfig, type Tx } from '@natech/db';
import { computeBusinessDate, type BusinessDayConfig } from './businessDateLogic';

export type { BusinessDayConfig };
export { computeBusinessDate };

/**
 * Business date, read from the database — BUILD-PLAN.md §5.6, §5.8, defect
 * C6; docs/runfiles/M14-storefront.md §3.
 *
 * Mirrors `apps/pos/lib/orders/businessDate.ts`'s `readBusinessDayConfig`
 * exactly: called inside `placeOrderAction`'s own transaction, since the
 * value has to be decided alongside the `order_no` it is allocated against
 * (R2 — every read inside a mutating action goes through the transaction,
 * never `dbRead`).
 */
export async function readBusinessDayConfig(tx: Tx): Promise<BusinessDayConfig> {
  const rows = await tx
    .select({ timezone: outletConfig.timezone, cutoff: outletConfig.businessDayCutoff })
    .from(outletConfig)
    .where(eq(outletConfig.singleton, true));

  const row = rows[0];
  if (row === undefined) {
    throw new Error('outlet_config has no row. Run the seed before placing an order.');
  }
  return { timezone: row.timezone, cutoff: row.cutoff };
}
