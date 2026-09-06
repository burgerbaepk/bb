import 'server-only';
import { eq } from 'drizzle-orm';
import { outletConfig, type Tx } from '@natech/db';
import { computeBusinessDate, type BusinessDayConfig } from './businessDateLogic';

export type { BusinessDayConfig };
export { computeBusinessDate };

/**
 * Business date, read from the database — BUILD-PLAN.md §5.6, §5.8, defect C6.
 *
 * §5.8: "Set `business_date` explicitly ... Do not derive it at read time."
 * That rule is written about `invoices` (finalize), but §5.6 gives
 * `orders.business_date` the identical shape and the identical reason:
 * `orders_business_date_no_idx` is a partial-unique index on
 * `(business_date, order_no)`, so the value written here is load-bearing for
 * order-number allocation, not a display convenience.
 *
 * The arithmetic itself lives in `businessDateLogic.ts`, split out so it can
 * be unit-tested without a database (see that file's doc comment for why).
 * This file is the thin, `server-only`-guarded half that reads
 * `outlet_config.timezone`/`business_day_cutoff` and hands them to it.
 */

/**
 * Reads the one `outlet_config` row's timezone and cutoff.
 *
 * Takes the caller's transaction handle rather than opening its own read —
 * `placeOrderAction` is the only caller, and it needs this value decided
 * inside the same transaction that allocates `order_no` against it (R2: every
 * read inside an action goes through `dbWrite`/`tx`, never `dbRead`).
 */
export async function readBusinessDayConfig(tx: Tx): Promise<BusinessDayConfig> {
  const rows = await tx
    .select({ timezone: outletConfig.timezone, cutoff: outletConfig.businessDayCutoff })
    .from(outletConfig)
    .where(eq(outletConfig.singleton, true));

  const row = rows[0];
  if (row === undefined) {
    throw new Error('outlet_config has no row. Run the seed before taking an order.');
  }
  return { timezone: row.timezone, cutoff: row.cutoff };
}

/** Today's business date, per §5.8. `at` defaults to now — overridable for tests. */
export async function currentBusinessDate(tx: Tx, at: Date = new Date()): Promise<string> {
  const config = await readBusinessDayConfig(tx);
  return computeBusinessDate(at, config);
}
