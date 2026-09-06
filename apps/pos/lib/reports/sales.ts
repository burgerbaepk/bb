import 'server-only';
import { and, between, eq, isNull } from 'drizzle-orm';
import { categories, dbRead, invoices, menuItems, orderLines, orders, payments } from '@natech/db';
import { extend, paisa, parseQty, qty, qtyToString, sum, type Paisa } from '@natech/domain';
import type {
  CategoryMixRow,
  ChannelMixRow,
  DateRange,
  ItemSalesRow,
  PaymentMixRow,
  SalesByDateRow,
} from '@natech/contracts';

/**
 * Sales reports — BUILD-PLAN.md §17, R16; docs/runfiles/M13-reporting.md §3.
 *
 * Windowed on `invoices.businessDate` throughout — a plain `date` column, not
 * a timestamp resolved to a date at read time (defect C6). Item sales and
 * category mix are the two figures `invoices` itself cannot answer (it has no
 * line-item breakdown), so those two join back through `orders.id →
 * invoices.orderId` to `order_lines`, excluding voided lines — a voided line
 * was never charged.
 */
const CHANNELS = ['POS', 'WEB', 'PHONE'] as const;
const PAYMENT_METHODS = ['CASH', 'CARD', 'WALLET', 'QR'] as const;

function bps(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.min(10_000, Math.max(0, Math.round((numerator / denominator) * 10_000)));
}

export async function readSalesByDate(range: DateRange): Promise<SalesByDateRow[]> {
  const rows = await dbRead()
    .select({
      businessDate: invoices.businessDate,
      taxableBase: invoices.taxableBase,
      taxTotal: invoices.taxTotal,
      deliveryCharge: invoices.deliveryCharge,
      serviceCharge: invoices.serviceCharge,
      grandTotal: invoices.grandTotal,
      guestCount: orders.guestCount,
    })
    .from(invoices)
    .innerJoin(orders, eq(invoices.orderId, orders.id))
    .where(
      and(
        between(invoices.businessDate, range.fromBusinessDate, range.toBusinessDate),
        isNull(invoices.deletedAt),
      ),
    );

  const byDate = new Map<string, typeof rows>();
  for (const row of rows) {
    const existing = byDate.get(row.businessDate);
    if (existing === undefined) byDate.set(row.businessDate, [row]);
    else existing.push(row);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([businessDate, dayRows]) => ({
      businessDate,
      invoiceCount: dayRows.length,
      covers: dayRows.reduce((total, row) => total + (row.guestCount ?? 0), 0),
      netSales: sum(dayRows.map((row) => paisa(row.taxableBase))),
      taxCollected: sum(dayRows.map((row) => paisa(row.taxTotal))),
      deliveryCharge: sum(dayRows.map((row) => paisa(row.deliveryCharge))),
      serviceCharge: sum(dayRows.map((row) => paisa(row.serviceCharge))),
      grossTakings: sum(dayRows.map((row) => paisa(row.grandTotal))),
    }));
}

interface InvoicedLineRow {
  readonly nameSnapshot: string;
  readonly categoryName: string;
  readonly qty: string;
  readonly unitPrice: bigint;
  readonly lineDiscount: bigint;
}

/** Shared by item sales and category mix — both read the same invoiced, non-voided lines. */
async function readInvoicedLines(range: DateRange): Promise<InvoicedLineRow[]> {
  const rows = await dbRead()
    .select({
      nameSnapshot: orderLines.nameSnapshot,
      categoryName: categories.name,
      qty: orderLines.qty,
      unitPrice: orderLines.unitPrice,
      lineDiscount: orderLines.lineDiscount,
    })
    .from(orderLines)
    .innerJoin(orders, eq(orderLines.orderId, orders.id))
    .innerJoin(invoices, eq(invoices.orderId, orders.id))
    .leftJoin(menuItems, eq(orderLines.menuItemId, menuItems.id))
    .leftJoin(categories, eq(menuItems.categoryId, categories.id))
    .where(
      and(
        between(invoices.businessDate, range.fromBusinessDate, range.toBusinessDate),
        isNull(orderLines.voidReason),
        isNull(invoices.deletedAt),
        isNull(orderLines.deletedAt),
      ),
    );

  return rows.map((row) => ({ ...row, categoryName: row.categoryName ?? 'Uncategorised' }));
}

function lineNetSales(row: InvoicedLineRow): Paisa {
  return paisa(extend(paisa(row.unitPrice), parseQty(row.qty)) - row.lineDiscount);
}

export async function readItemSales(range: DateRange): Promise<ItemSalesRow[]> {
  const lines = await readInvoicedLines(range);

  const byItem = new Map<string, InvoicedLineRow[]>();
  for (const row of lines) {
    const key = `${row.nameSnapshot} ${row.categoryName}`;
    const existing = byItem.get(key);
    if (existing === undefined) byItem.set(key, [row]);
    else existing.push(row);
  }

  return [...byItem.values()]
    .map((itemRows) => {
      const first = itemRows[0];
      if (first === undefined) throw new Error('unreachable: grouped by at least one row');
      const totalQty = itemRows.reduce((total, row) => total + parseQty(row.qty), 0n);
      return {
        itemName: first.nameSnapshot,
        categoryName: first.categoryName,
        qtySold: qtyToString(qty(totalQty)),
        netSales: sum(itemRows.map(lineNetSales)),
      };
    })
    .sort((a, b) => (b.netSales > a.netSales ? 1 : b.netSales < a.netSales ? -1 : 0));
}

export async function readCategoryMix(range: DateRange): Promise<CategoryMixRow[]> {
  const lines = await readInvoicedLines(range);

  const byCategory = new Map<string, InvoicedLineRow[]>();
  for (const row of lines) {
    const existing = byCategory.get(row.categoryName);
    if (existing === undefined) byCategory.set(row.categoryName, [row]);
    else existing.push(row);
  }

  const totalNet = sum(lines.map(lineNetSales));
  return [...byCategory.entries()]
    .map(([categoryName, categoryRows]) => {
      const netSales = sum(categoryRows.map(lineNetSales));
      return {
        categoryName,
        // A count of line entries, not the summed (possibly fractional) qty —
        // `itemCount` is a plain int and a 0.5kg line must not round into it.
        itemCount: categoryRows.length,
        netSales,
        shareBps: bps(Number(netSales), Number(totalNet)),
      };
    })
    .sort((a, b) => (b.netSales > a.netSales ? 1 : b.netSales < a.netSales ? -1 : 0));
}

export async function readChannelMix(range: DateRange): Promise<ChannelMixRow[]> {
  const rows = await dbRead()
    .select({ channel: orders.channel, taxableBase: invoices.taxableBase })
    .from(invoices)
    .innerJoin(orders, eq(invoices.orderId, orders.id))
    .where(
      and(
        between(invoices.businessDate, range.fromBusinessDate, range.toBusinessDate),
        isNull(invoices.deletedAt),
      ),
    );

  const totalNet = sum(rows.map((row) => paisa(row.taxableBase)));
  return CHANNELS.map((channel) => {
    const forChannel = rows.filter((row) => row.channel === channel);
    const netSales = sum(forChannel.map((row) => paisa(row.taxableBase)));
    return {
      channel,
      orderCount: forChannel.length,
      netSales,
      shareBps: bps(Number(netSales), Number(totalNet)),
    };
  });
}

export async function readPaymentMix(range: DateRange): Promise<PaymentMixRow[]> {
  const rows = await dbRead()
    .select({
      method: payments.method,
      amount: payments.amount,
      attemptStatus: payments.attemptStatus,
    })
    .from(payments)
    .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
    .where(
      and(
        between(invoices.businessDate, range.fromBusinessDate, range.toBusinessDate),
        isNull(payments.deletedAt),
        isNull(invoices.deletedAt),
      ),
    );

  const approvedTotal = sum(
    rows.filter((row) => row.attemptStatus === 'APPROVED').map((row) => paisa(row.amount)),
  );
  return PAYMENT_METHODS.map((method) => {
    const forMethod = rows.filter((row) => row.method === method);
    const amount = sum(
      forMethod.filter((row) => row.attemptStatus === 'APPROVED').map((row) => paisa(row.amount)),
    );
    return {
      method,
      approvedCount: forMethod.filter((row) => row.attemptStatus === 'APPROVED').length,
      declinedCount: forMethod.filter((row) => row.attemptStatus === 'DECLINED').length,
      amount,
      shareBps: bps(Number(amount), Number(approvedTotal)),
    };
  });
}
