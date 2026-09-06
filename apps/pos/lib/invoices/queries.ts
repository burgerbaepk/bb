import 'server-only';

import { and, desc, eq, gte, ilike, inArray, isNull, lte, or } from 'drizzle-orm';
import {
  customers,
  dbRead,
  invoiceTaxLines,
  invoices,
  orders,
  payments,
  posTerminals,
  taxClasses,
  users,
} from '@natech/db';
import { paisa } from '@natech/domain';
import type { Invoice, TaxClassKey } from '@natech/contracts';
import { loadPriceableOrder } from '../orders/pricing';

export interface InvoiceListRow {
  readonly id: string;
  readonly localNo: string;
  readonly orderNo: number;
  readonly businessDate: string;
  readonly finalizedAt: Date;
  readonly customerName: string | null;
  readonly paymentMethods: string;
  readonly grandTotal: bigint;
  readonly status: 'FINALIZED' | 'CREDITED';
}

export async function listInvoices(filters: {
  readonly query?: string;
  readonly from?: string;
  readonly to?: string;
  readonly shiftId?: string;
}): Promise<InvoiceListRow[]> {
  const db = dbRead();
  const query = filters.query?.trim() ?? '';
  const conditions = [isNull(invoices.deletedAt)];
  if (filters.from) conditions.push(gte(invoices.businessDate, filters.from));
  if (filters.to) conditions.push(lte(invoices.businessDate, filters.to));
  if (filters.shiftId) conditions.push(eq(invoices.shiftId, filters.shiftId));
  if (query) {
    const orderNo = Number(query);
    const search = or(
      ilike(invoices.localNo, `%${query}%`),
      ilike(customers.name, `%${query}%`),
      ilike(customers.phone, `%${query}%`),
      ...(Number.isInteger(orderNo) ? [eq(orders.orderNo, orderNo)] : []),
    );
    if (search) conditions.push(search);
  }

  const rows = await db
    .select({
      id: invoices.id,
      localNo: invoices.localNo,
      orderNo: orders.orderNo,
      businessDate: invoices.businessDate,
      finalizedAt: invoices.finalizedAt,
      customerName: customers.name,
      grandTotal: invoices.grandTotal,
      status: invoices.status,
    })
    .from(invoices)
    .innerJoin(orders, eq(orders.id, invoices.orderId))
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .where(and(...conditions))
    .orderBy(desc(invoices.finalizedAt))
    .limit(100);

  const paymentRows =
    rows.length === 0
      ? []
      : await db
          .select({ invoiceId: payments.invoiceId, method: payments.method })
          .from(payments)
          .where(
            and(
              isNull(payments.deletedAt),
              inArray(
                payments.invoiceId,
                rows.map((row) => row.id),
              ),
            ),
          );
  return rows.map((row) => ({
    ...row,
    grandTotal: paisa(row.grandTotal),
    paymentMethods: [
      ...new Set(paymentRows.filter((p) => p.invoiceId === row.id).map((p) => p.method)),
    ].join(' + '),
  }));
}

export async function readInvoiceDetail(id: string): Promise<{
  invoice: Invoice;
  order: NonNullable<Awaited<ReturnType<typeof loadPriceableOrder>>>['order'];
} | null> {
  const db = dbRead();
  const rows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), isNull(invoices.deletedAt)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const [loadedOrder, taxRows, paymentRows, people, terminals] = await Promise.all([
    loadPriceableOrder(db, row.orderId),
    db
      .select({
        id: invoiceTaxLines.id,
        rateBps: invoiceTaxLines.rateBps,
        base: invoiceTaxLines.base,
        amount: invoiceTaxLines.amount,
        paymentMethodScope: invoiceTaxLines.paymentMethodScope,
        taxClass: taxClasses.key,
      })
      .from(invoiceTaxLines)
      .leftJoin(taxClasses, eq(taxClasses.id, invoiceTaxLines.taxClassId))
      .where(and(eq(invoiceTaxLines.invoiceId, id), isNull(invoiceTaxLines.deletedAt))),
    db
      .select()
      .from(payments)
      .where(and(eq(payments.invoiceId, id), isNull(payments.deletedAt))),
    row.finalizedBy === null
      ? Promise.resolve([])
      : db.select({ name: users.displayName }).from(users).where(eq(users.id, row.finalizedBy)),
    row.terminalId === null
      ? Promise.resolve([])
      : db
          .select({ label: posTerminals.label })
          .from(posTerminals)
          .where(eq(posTerminals.id, row.terminalId)),
  ]);
  if (!loadedOrder) return null;
  return {
    order: loadedOrder.order,
    invoice: {
      id: row.id,
      orderId: row.orderId,
      localNo: row.localNo,
      businessDate: row.businessDate,
      finalizedAt: row.finalizedAt,
      finalizedByName: people[0]?.name ?? null,
      terminalLabel: terminals[0]?.label ?? null,
      status: row.status,
      subtotal: paisa(row.subtotal),
      discountTotal: paisa(row.discountTotal),
      taxableBase: paisa(row.taxableBase),
      taxTotal: paisa(row.taxTotal),
      deliveryCharge: paisa(row.deliveryCharge),
      serviceCharge: paisa(row.serviceCharge),
      posFee: paisa(row.posFee),
      roundingAdj: paisa(row.roundingAdj),
      grandTotal: paisa(row.grandTotal),
      printedCount: row.printedCount,
      taxLines: taxRows.map((line) => ({
        id: line.id,
        taxClass: (line.taxClass ?? 'STANDARD_FOOD') as TaxClassKey,
        rateBps: line.rateBps,
        base: paisa(line.base),
        amount: paisa(line.amount),
        paymentMethodScope: line.paymentMethodScope ?? 'CASH',
      })),
      payments: paymentRows.map((payment) => ({
        id: payment.id,
        method: payment.method,
        amount: paisa(payment.amount),
        tendered: payment.tendered === null ? null : paisa(payment.tendered),
        change: payment.change === null ? null : paisa(payment.change),
        cardLast4: payment.cardLast4,
        terminalRef: payment.terminalRef,
        taxRateAppliedBps: payment.taxRateAppliedBps,
        attemptStatus: payment.attemptStatus,
        declinedReason: payment.declinedReason,
        at: payment.createdAt,
      })),
    },
  };
}

/**
 * The most recently finalized invoice, for the receipt-layout previews on the
 * settings screen (§14.3, §14.4).
 *
 * Deliberately a real invoice rather than a fabricated specimen. A manager
 * changing the paper width or the footer lines is asking "what will my
 * receipts look like", and the honest answer uses their own outlet identity,
 * their own item names and their own allocated invoice number — the same
 * document `/admin/invoices/[id]` would reprint. It is also the C4 rule: a
 * fabricated receipt on a shipped surface teaches staff that the screen is
 * decorative.
 *
 * Null before the first sale, which the caller renders as an explanation
 * rather than as an empty frame.
 */
export async function readLatestInvoiceForPreview(): ReturnType<typeof readInvoiceDetail> {
  const rows = await dbRead()
    .select({ id: invoices.id })
    .from(invoices)
    .where(isNull(invoices.deletedAt))
    .orderBy(desc(invoices.finalizedAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return readInvoiceDetail(row.id);
}
