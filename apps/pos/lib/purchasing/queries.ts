import 'server-only';
import { and, asc, between, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  dbRead,
  demandItems,
  purchaseOrderLines,
  purchaseOrders,
  supplierBillLines,
  supplierBills,
  supplierPayments,
  suppliers,
  users,
} from '@natech/db';
import { paisa, parseQty, sum, type Paisa, type Qty } from '@natech/domain';
import {
  runningStatement,
  supplierBalance,
  type SettlementMethod,
  type StatementRow,
  type SupplierAmounts,
} from './rules';

/**
 * Purchasing — ADR 0035, docs/runfiles/M29-purchasing.md. Reads only, through
 * `dbRead` (R2).
 *
 * Every balance on every screen goes through `supplierBalance`, the same
 * function the payment action checks against, so the figure a manager reads
 * and the figure a refusal quotes cannot disagree.
 */

export interface SupplierRow extends SupplierAmounts {
  readonly id: string;
  readonly name: string;
  readonly contactPerson: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly ntn: string | null;
  readonly openingBalance: Paisa;
  readonly note: string | null;
  readonly isActive: boolean;
}

/** Σ posted bill totals and Σ payments per supplier, summed in SQL. */
async function supplierSums(ids?: readonly string[]) {
  const billWhere = and(
    isNull(supplierBills.deletedAt),
    eq(supplierBills.status, 'POSTED'),
    ids === undefined ? undefined : inArray(supplierBills.supplierId, [...ids]),
  );
  const payWhere = and(
    isNull(supplierPayments.deletedAt),
    ids === undefined ? undefined : inArray(supplierPayments.supplierId, [...ids]),
  );
  const [bills, pays] = await Promise.all([
    dbRead()
      .select({ id: supplierBills.supplierId, total: sql<string>`sum(${supplierBills.total})` })
      .from(supplierBills)
      .where(billWhere)
      .groupBy(supplierBills.supplierId),
    dbRead()
      .select({
        id: supplierPayments.supplierId,
        total: sql<string>`sum(${supplierPayments.amount})`,
      })
      .from(supplierPayments)
      .where(payWhere)
      .groupBy(supplierPayments.supplierId),
  ]);
  // `sum()` over bigint arrives as a numeric string; BigInt reads it exactly.
  return {
    billed: new Map(bills.map((r) => [r.id, paisa(BigInt(r.total))])),
    paid: new Map(pays.map((r) => [r.id, paisa(BigInt(r.total))])),
  };
}

const supplierColumns = {
  id: suppliers.id,
  name: suppliers.name,
  contactPerson: suppliers.contactPerson,
  phone: suppliers.phone,
  address: suppliers.address,
  ntn: suppliers.ntn,
  openingBalance: suppliers.openingBalance,
  note: suppliers.note,
  isActive: suppliers.isActive,
};

export async function readSuppliers(): Promise<SupplierRow[]> {
  const [rows, sums] = await Promise.all([
    dbRead()
      .select(supplierColumns)
      .from(suppliers)
      .where(isNull(suppliers.deletedAt))
      .orderBy(desc(suppliers.isActive), asc(suppliers.name)),
    supplierSums(),
  ]);
  return rows.map((row) => {
    const opening = paisa(row.openingBalance);
    const billed = sums.billed.get(row.id);
    const paid = sums.paid.get(row.id);
    return {
      ...row,
      openingBalance: opening,
      ...supplierBalance(
        opening,
        billed === undefined ? [] : [billed],
        paid === undefined ? [] : [paid],
      ),
    };
  });
}

export interface SupplierDetail {
  readonly supplier: SupplierRow;
  readonly statement: readonly StatementRow[];
}

export async function readSupplier(id: string): Promise<SupplierDetail | null> {
  const [row] = await dbRead()
    .select(supplierColumns)
    .from(suppliers)
    .where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)));
  if (row === undefined) return null;
  const [bills, pays] = await Promise.all([
    dbRead()
      .select({
        id: supplierBills.id,
        billNo: supplierBills.billNo,
        supplierRef: supplierBills.supplierRef,
        billedOn: supplierBills.billedOn,
        total: supplierBills.total,
      })
      .from(supplierBills)
      .where(
        and(
          eq(supplierBills.supplierId, id),
          eq(supplierBills.status, 'POSTED'),
          isNull(supplierBills.deletedAt),
        ),
      ),
    dbRead()
      .select({
        id: supplierPayments.id,
        paidOn: supplierPayments.paidOn,
        amount: supplierPayments.amount,
        method: supplierPayments.method,
        reference: supplierPayments.reference,
        note: supplierPayments.note,
        throughTill: supplierPayments.cashMovementId,
      })
      .from(supplierPayments)
      .where(and(eq(supplierPayments.supplierId, id), isNull(supplierPayments.deletedAt))),
  ]);
  const opening = paisa(row.openingBalance);
  const supplier: SupplierRow = {
    ...row,
    openingBalance: opening,
    ...supplierBalance(
      opening,
      bills.map((b) => paisa(b.total)),
      pays.map((p) => paisa(p.amount)),
    ),
  };
  const statement = runningStatement(opening, [
    ...bills.map((b) => ({
      id: b.id,
      date: b.billedOn,
      kind: 'BILL' as const,
      reference: `Bill #${b.billNo}`,
      detail: b.supplierRef === null ? null : `Their invoice ${b.supplierRef}`,
      debit: paisa(b.total),
      credit: null,
      href: `/admin/purchases/${b.id}`,
    })),
    ...pays.map((p) => ({
      id: p.id,
      date: p.paidOn,
      kind: 'PAYMENT' as const,
      reference: `Payment · ${METHOD_SHORT[p.method]}${p.throughTill === null ? '' : ' (till)'}`,
      detail: [p.reference, p.note].filter((part) => part !== null).join(' · ') || null,
      debit: null,
      credit: paisa(p.amount),
      href: null,
    })),
  ]);
  return { supplier, statement };
}

const METHOD_SHORT: Record<SettlementMethod, string> = {
  CASH: 'cash',
  BANK_TRANSFER: 'bank transfer',
  CHEQUE: 'cheque',
  WALLET: 'wallet',
};

/* ---------------------------------------------------------- purchase orders */

export type PurchaseOrderStatus = 'OPEN' | 'CLOSED' | 'CANCELLED';

export interface PurchaseOrderRow {
  readonly id: string;
  readonly poNo: number;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly status: PurchaseOrderStatus;
  readonly orderedOn: string;
  readonly expectedOn: string | null;
  readonly lineCount: number;
  /** Σ agreed line amounts; lines with no agreed price add nothing. */
  readonly expectedTotal: Paisa;
}

export async function readPurchaseOrders(): Promise<PurchaseOrderRow[]> {
  const rows = await dbRead()
    .select({
      id: purchaseOrders.id,
      poNo: purchaseOrders.poNo,
      supplierId: purchaseOrders.supplierId,
      supplierName: suppliers.name,
      status: purchaseOrders.status,
      orderedOn: purchaseOrders.orderedOn,
      expectedOn: purchaseOrders.expectedOn,
      lineCount: sql<number>`count(${purchaseOrderLines.id})::int`,
      expectedTotal: sql<string>`coalesce(sum(${purchaseOrderLines.amount}), 0)`,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .leftJoin(
      purchaseOrderLines,
      and(
        eq(purchaseOrderLines.purchaseOrderId, purchaseOrders.id),
        isNull(purchaseOrderLines.deletedAt),
      ),
    )
    .where(isNull(purchaseOrders.deletedAt))
    .groupBy(purchaseOrders.id, suppliers.name)
    // Open first — they are the ones somebody is waiting on.
    .orderBy(sql`${purchaseOrders.status} = 'OPEN' desc`, desc(purchaseOrders.poNo))
    .limit(200);
  return rows.map((row) => ({ ...row, expectedTotal: paisa(BigInt(row.expectedTotal)) }));
}

export interface PurchaseLineRow {
  readonly id: string;
  readonly itemId: string;
  readonly name: string;
  readonly unit: string | null;
  readonly quantity: Qty;
  readonly amount: Paisa | null;
}

export interface PurchaseOrderDetail extends PurchaseOrderRow {
  readonly note: string | null;
  readonly createdBy: string | null;
  readonly lines: readonly PurchaseLineRow[];
  /** The bill that closed it, if one did. */
  readonly billId: string | null;
}

export async function readPurchaseOrder(id: string): Promise<PurchaseOrderDetail | null> {
  const [header] = await dbRead()
    .select({
      id: purchaseOrders.id,
      poNo: purchaseOrders.poNo,
      supplierId: purchaseOrders.supplierId,
      supplierName: suppliers.name,
      status: purchaseOrders.status,
      orderedOn: purchaseOrders.orderedOn,
      expectedOn: purchaseOrders.expectedOn,
      note: purchaseOrders.note,
      createdBy: users.displayName,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .leftJoin(users, eq(users.id, purchaseOrders.createdBy))
    .where(and(eq(purchaseOrders.id, id), isNull(purchaseOrders.deletedAt)));
  if (header === undefined) return null;

  const [lines, bill] = await Promise.all([
    dbRead()
      .select({
        id: purchaseOrderLines.id,
        itemId: purchaseOrderLines.itemId,
        name: demandItems.name,
        unit: demandItems.defaultUnit,
        qty: purchaseOrderLines.qty,
        amount: purchaseOrderLines.amount,
      })
      .from(purchaseOrderLines)
      .innerJoin(demandItems, eq(demandItems.id, purchaseOrderLines.itemId))
      .where(and(eq(purchaseOrderLines.purchaseOrderId, id), isNull(purchaseOrderLines.deletedAt)))
      .orderBy(asc(purchaseOrderLines.createdAt)),
    dbRead()
      .select({ id: supplierBills.id })
      .from(supplierBills)
      .where(
        and(
          eq(supplierBills.purchaseOrderId, id),
          eq(supplierBills.status, 'POSTED'),
          isNull(supplierBills.deletedAt),
        ),
      )
      .limit(1),
  ]);
  const mapped = lines.map(({ qty, amount, ...line }) => ({
    ...line,
    quantity: parseQty(qty),
    amount: amount === null ? null : paisa(amount),
  }));
  return {
    ...header,
    lineCount: mapped.length,
    expectedTotal: sum(mapped.map((line) => line.amount ?? paisa(0n))),
    lines: mapped,
    billId: bill[0]?.id ?? null,
  };
}

/* ------------------------------------------------------------------ bills */

export type BillStatus = 'POSTED' | 'CANCELLED';

export interface BillRow {
  readonly id: string;
  readonly billNo: number;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly supplierRef: string | null;
  readonly billedOn: string;
  readonly dueOn: string | null;
  readonly total: Paisa;
  readonly status: BillStatus;
}

const billColumns = {
  id: supplierBills.id,
  billNo: supplierBills.billNo,
  supplierId: supplierBills.supplierId,
  supplierName: suppliers.name,
  supplierRef: supplierBills.supplierRef,
  billedOn: supplierBills.billedOn,
  dueOn: supplierBills.dueOn,
  total: supplierBills.total,
  status: supplierBills.status,
};

export async function readBills(from: string, to: string): Promise<BillRow[]> {
  const rows = await dbRead()
    .select(billColumns)
    .from(supplierBills)
    .innerJoin(suppliers, eq(suppliers.id, supplierBills.supplierId))
    .where(and(between(supplierBills.billedOn, from, to), isNull(supplierBills.deletedAt)))
    .orderBy(desc(supplierBills.billedOn), desc(supplierBills.billNo));
  return rows.map((row) => ({ ...row, total: paisa(row.total) }));
}

export interface BillDetail extends BillRow {
  readonly purchaseOrderId: string | null;
  readonly poNo: number | null;
  readonly charges: Paisa;
  readonly discount: Paisa;
  readonly note: string | null;
  readonly createdBy: string | null;
  readonly cancelReason: string | null;
  readonly lines: readonly PurchaseLineRow[];
}

export async function readBill(id: string): Promise<BillDetail | null> {
  const [row] = await dbRead()
    .select({
      ...billColumns,
      purchaseOrderId: supplierBills.purchaseOrderId,
      poNo: purchaseOrders.poNo,
      charges: supplierBills.charges,
      discount: supplierBills.discount,
      note: supplierBills.note,
      createdBy: users.displayName,
      cancelReason: supplierBills.cancelReason,
    })
    .from(supplierBills)
    .innerJoin(suppliers, eq(suppliers.id, supplierBills.supplierId))
    .leftJoin(purchaseOrders, eq(purchaseOrders.id, supplierBills.purchaseOrderId))
    .leftJoin(users, eq(users.id, supplierBills.createdBy))
    .where(and(eq(supplierBills.id, id), isNull(supplierBills.deletedAt)));
  if (row === undefined) return null;
  const lines = await dbRead()
    .select({
      id: supplierBillLines.id,
      itemId: supplierBillLines.itemId,
      name: demandItems.name,
      unit: demandItems.defaultUnit,
      qty: supplierBillLines.qty,
      amount: supplierBillLines.amount,
    })
    .from(supplierBillLines)
    .innerJoin(demandItems, eq(demandItems.id, supplierBillLines.itemId))
    .where(and(eq(supplierBillLines.billId, id), isNull(supplierBillLines.deletedAt)))
    .orderBy(asc(supplierBillLines.createdAt));
  return {
    ...row,
    total: paisa(row.total),
    charges: paisa(row.charges),
    discount: paisa(row.discount),
    lines: lines.map(({ qty, amount, ...line }) => ({
      ...line,
      quantity: parseQty(qty),
      amount: paisa(amount),
    })),
  };
}

/* ---------------------------------------------------------------- report */

export interface PurchaseBySupplier {
  readonly supplierId: string;
  readonly name: string;
  readonly bills: number;
  readonly total: Paisa;
}

export interface PurchaseByItem {
  readonly itemId: string;
  readonly name: string;
  readonly category: string;
  readonly unit: string | null;
  readonly quantity: Qty;
  readonly amount: Paisa;
}

export interface PurchaseSummary {
  readonly bySupplier: readonly PurchaseBySupplier[];
  readonly byItem: readonly PurchaseByItem[];
  readonly paid: Paisa;
}

/**
 * What was bought between two dates, by supplier and by item, from posted
 * bills only. By item is goods value — the bill's charges and discount belong
 * to the bill, not to one line, so they are in the by-supplier figure and not
 * spread across items (which would invent a per-item cost nobody agreed).
 */
export async function readPurchaseSummary(from: string, to: string): Promise<PurchaseSummary> {
  const posted = and(
    between(supplierBills.billedOn, from, to),
    eq(supplierBills.status, 'POSTED'),
    isNull(supplierBills.deletedAt),
  );
  const [bySupplier, byItem, paid] = await Promise.all([
    dbRead()
      .select({
        supplierId: suppliers.id,
        name: suppliers.name,
        bills: sql<number>`count(*)::int`,
        total: sql<string>`sum(${supplierBills.total})`,
      })
      .from(supplierBills)
      .innerJoin(suppliers, eq(suppliers.id, supplierBills.supplierId))
      .where(posted)
      .groupBy(suppliers.id)
      .orderBy(sql`sum(${supplierBills.total}) desc`),
    dbRead()
      .select({
        itemId: demandItems.id,
        name: demandItems.name,
        category: demandItems.category,
        unit: demandItems.defaultUnit,
        quantity: sql<string>`sum(${supplierBillLines.qty})`,
        amount: sql<string>`sum(${supplierBillLines.amount})`,
      })
      .from(supplierBillLines)
      .innerJoin(supplierBills, eq(supplierBills.id, supplierBillLines.billId))
      .innerJoin(demandItems, eq(demandItems.id, supplierBillLines.itemId))
      .where(and(posted, isNull(supplierBillLines.deletedAt)))
      .groupBy(demandItems.id)
      .orderBy(sql`sum(${supplierBillLines.amount}) desc`),
    dbRead()
      .select({ total: sql<string>`coalesce(sum(${supplierPayments.amount}), 0)` })
      .from(supplierPayments)
      .where(and(between(supplierPayments.paidOn, from, to), isNull(supplierPayments.deletedAt))),
  ]);
  return {
    bySupplier: bySupplier.map((row) => ({ ...row, total: paisa(BigInt(row.total)) })),
    byItem: byItem.map((row) => ({
      ...row,
      // `sum(numeric(10,3))` keeps three decimals, which is what parseQty reads.
      quantity: parseQty(row.quantity),
      amount: paisa(BigInt(row.amount)),
    })),
    paid: paisa(BigInt(paid[0]?.total ?? '0')),
  };
}

/** Active suppliers, for the pickers on the PO and bill forms. */
export async function readSupplierOptions(): Promise<{ id: string; name: string }[]> {
  return dbRead()
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(and(isNull(suppliers.deletedAt), eq(suppliers.isActive, true)))
    .orderBy(asc(suppliers.name));
}

/** Open purchase orders, for the "bill against a PO" picker. */
export async function readOpenPurchaseOrders(): Promise<
  { id: string; poNo: number; supplierId: string; supplierName: string }[]
> {
  return dbRead()
    .select({
      id: purchaseOrders.id,
      poNo: purchaseOrders.poNo,
      supplierId: purchaseOrders.supplierId,
      supplierName: suppliers.name,
    })
    .from(purchaseOrders)
    .innerJoin(suppliers, eq(suppliers.id, purchaseOrders.supplierId))
    .where(and(eq(purchaseOrders.status, 'OPEN'), isNull(purchaseOrders.deletedAt)))
    .orderBy(desc(purchaseOrders.poNo));
}
