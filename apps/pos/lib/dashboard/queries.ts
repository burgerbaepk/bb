import 'server-only';
import { and, between, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  categories,
  dbRead,
  expenses,
  invoices,
  menuItems,
  orderLines,
  orders,
  shifts,
} from '@natech/db';
import { paisa, parseQty, sum, type Paisa, type Qty } from '@natech/domain';
import { shiftDays, trendWindowStart, type SalesSeriesRow } from '@/lib/dashboard/trend';

/**
 * The dashboard — BUILD-PLAN.md §14.2, §17, §2 R1, R6, R16; ADR 0023.
 *
 * Everything on this screen comes from finalized invoices and recorded
 * expenses. There is no tax figure here by design (ADR 0023): tax is a
 * statutory return, it is authoritative only at finalize (R9), and a manager
 * opening this screen between services is asking what sold, not what is owed.
 * The tax report and the compliance dashboard are where that question is asked.
 *
 * Aggregation is done in SQL rather than by pulling rows and folding them in
 * JavaScript, which is what `lib/reports/sales.ts` does. That is the right
 * trade there — a report is opened deliberately, over a chosen window, and the
 * fold keeps the money in `bigint`. It is the wrong trade here: this page is
 * the back office's front door, its trend window is a full year, and a busy
 * outlet would ship tens of thousands of invoice rows over the HTTP driver on
 * every visit. The two must agree, so both windows are half-open on
 * `invoices.businessDate` and both exclude voided lines and soft-deleted rows.
 */

const TOP_ITEM_LIMIT = 6;
/** Trailing window for "what is selling". Long enough to survive one quiet service. */
export const TOP_ITEM_DAYS = 30;
/** A restaurant's week is not flat, so the honest comparison is the same weekday. */
const COMPARISON_LAG_DAYS = 7;

export interface TopItemRow {
  readonly itemName: string;
  readonly categoryName: string;
  /** Thousandths (§5.6) — `formatQty` is the render boundary. */
  readonly qtySold: Qty;
  readonly netSales: Paisa;
}

/** A business date the outlet did not trade on still has a row on this screen. */
const NO_TRADE: Omit<SalesSeriesRow, 'businessDate'> = {
  invoiceCount: 0,
  covers: 0,
  netSales: paisa(0n),
  grossTakings: paisa(0n),
};

/**
 * Daily takings across the widest trend window.
 *
 * `sum()` over a `bigint` column comes back from Postgres as `numeric`, and the
 * driver hands `numeric` over as a string, not as the `bigint` the mapped
 * column type would have produced. Casting to `text` and parsing with `BigInt`
 * is explicit about that rather than relying on what the driver happens to do —
 * `Number` here would put a float in the money path and undo R1 at the driver
 * boundary, which is exactly the failure `paisa()` in `columns.ts` exists to
 * prevent one layer down.
 */
async function readSalesSeries(fromBusinessDate: string, toBusinessDate: string) {
  const rows = await dbRead()
    .select({
      businessDate: invoices.businessDate,
      invoiceCount: sql<number>`count(*)::int`,
      covers: sql<number>`coalesce(sum(${orders.guestCount}), 0)::int`,
      netSales: sql<string>`sum(${invoices.taxableBase})::text`,
      grossTakings: sql<string>`sum(${invoices.grandTotal})::text`,
    })
    .from(invoices)
    .innerJoin(orders, eq(invoices.orderId, orders.id))
    .where(
      and(
        between(invoices.businessDate, fromBusinessDate, toBusinessDate),
        isNull(invoices.deletedAt),
      ),
    )
    .groupBy(invoices.businessDate)
    .orderBy(invoices.businessDate);

  return rows.map((row): SalesSeriesRow => ({
    businessDate: row.businessDate,
    invoiceCount: row.invoiceCount,
    covers: row.covers,
    netSales: paisa(BigInt(row.netSales)),
    grossTakings: paisa(BigInt(row.grossTakings)),
  }));
}

/**
 * What is actually selling, by net line value over the trailing window.
 *
 * Grouped on `nameSnapshot`, not on `menu_item_id`: the snapshot is what the
 * guest was charged for, and renaming a dish must not retrospectively rename
 * what was sold last month. That matches `readItemSales` in
 * `lib/reports/sales.ts` so the card and the report cannot disagree.
 *
 * The line extension is `round(unit_price * qty)` in `numeric`, Postgres's
 * exact decimal type, rounding half away from zero — the same arithmetic
 * `extend()` performs in `packages/domain`. No float is involved at any point,
 * so R1 holds through the aggregate.
 */
async function readTopItems(fromBusinessDate: string, toBusinessDate: string) {
  const netSales = sql<string>`sum(round(${orderLines.unitPrice} * ${orderLines.qty}) - ${orderLines.lineDiscount})::bigint::text`;
  const rows = await dbRead()
    .select({
      itemName: orderLines.nameSnapshot,
      categoryName: sql<string>`coalesce(${categories.name}, 'Uncategorised')`,
      qtySold: sql<string>`sum(${orderLines.qty})::text`,
      netSales,
    })
    .from(orderLines)
    .innerJoin(orders, eq(orderLines.orderId, orders.id))
    .innerJoin(invoices, eq(invoices.orderId, orders.id))
    .leftJoin(menuItems, eq(orderLines.menuItemId, menuItems.id))
    .leftJoin(categories, eq(menuItems.categoryId, categories.id))
    .where(
      and(
        between(invoices.businessDate, fromBusinessDate, toBusinessDate),
        // A voided line was never charged, so it never sold.
        isNull(orderLines.voidReason),
        isNull(invoices.deletedAt),
        isNull(orderLines.deletedAt),
      ),
    )
    .groupBy(orderLines.nameSnapshot, categories.name)
    .orderBy(desc(netSales))
    .limit(TOP_ITEM_LIMIT);

  return rows.map((row): TopItemRow => ({
    itemName: row.itemName,
    categoryName: row.categoryName,
    qtySold: parseQty(row.qtySold),
    netSales: paisa(BigInt(row.netSales)),
  }));
}

export async function readDashboard(businessDate: string) {
  const topItemsFrom = shiftDays(businessDate, -(TOP_ITEM_DAYS - 1));
  const [series, topItems, liveOrders, openShift, todayExpenses] = await Promise.all([
    readSalesSeries(trendWindowStart(businessDate), businessDate),
    readTopItems(topItemsFrom, businessDate),
    dbRead()
      .select({ n: count() })
      .from(orders)
      .where(and(inArray(orders.status, ['PLACED', 'SERVED']), isNull(orders.deletedAt))),
    dbRead()
      .select({ openedAt: shifts.openedAt })
      .from(shifts)
      .where(and(eq(shifts.status, 'OPEN'), isNull(shifts.deletedAt)))
      .limit(1),
    // Every expense recorded today, not a page of them. The total and the
    // preview list are folded from one result so the operating result cannot
    // be computed from a truncated ledger — it was, and five expenses looked
    // exactly like all of them.
    dbRead()
      .select({
        id: expenses.id,
        category: expenses.category,
        description: expenses.description,
        amount: expenses.amount,
      })
      .from(expenses)
      .where(and(eq(expenses.incurredOn, businessDate), isNull(expenses.deletedAt)))
      .orderBy(desc(expenses.createdAt)),
  ]);

  // Today and the comparison day are read out of the series rather than
  // queried again, so the headline figure and the chart's last bar are the
  // same number by construction (R16).
  const byDate = new Map(series.map((row) => [row.businessDate, row]));
  const today = byDate.get(businessDate) ?? { businessDate, ...NO_TRADE };
  const comparisonDate = shiftDays(businessDate, -COMPARISON_LAG_DAYS);
  const comparison = byDate.get(comparisonDate) ?? null;

  const expenseTotal = sum(todayExpenses.map((row) => paisa(row.amount)));

  return {
    businessDate,
    series,
    today,
    /** The same weekday a week ago, or `null` if the outlet did not trade then. */
    comparison,
    comparisonDate,
    topItems,
    liveOrderCount: liveOrders[0]?.n ?? 0,
    shiftOpenedAt: openShift[0]?.openedAt ?? null,
    expenseTotal,
    expenseCount: todayExpenses.length,
    operatingResult: paisa(today.netSales - expenseTotal),
    /** Gross per invoice, floored. Zero invoices is zero, not a division by zero. */
    averageTicket: paisa(
      today.invoiceCount === 0 ? 0n : today.grossTakings / BigInt(today.invoiceCount),
    ),
    recentExpenses: todayExpenses.slice(0, 5).map((row) => ({ ...row, amount: paisa(row.amount) })),
  };
}
