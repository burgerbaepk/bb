'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  cashMovements,
  dbWrite,
  demandItems,
  purchaseOrderLines,
  purchaseOrders,
  shifts,
  supplierBillLines,
  supplierBills,
  supplierPayments,
  suppliers,
  withIdempotency,
  writeAudit,
  type AuditContext,
  type Tx,
} from '@natech/db';
import { paisa, parsePaisa, parseQty, qty, qtyToString, type Paisa } from '@natech/domain';
import { assertPermission, requestContext, requireOperator } from '../auth/session';
import { currentBusinessDate } from '../orders/businessDate';
import { insertMovement, readBooks, saveUnit } from '../stock/book';
import { refuseMovement } from '../stock/ledger';
import {
  billTotal,
  collectLines,
  parseOptionalRupees,
  refuseSettlement,
  supplierBalance,
  type PurchaseLine,
  type RawLine,
} from './rules';

/**
 * Purchasing — ADR 0035, docs/runfiles/M29-purchasing.md.
 *
 * Every write is `expenses.write`, the manager's grant for operating records
 * since M23: suppliers, purchase orders, bills and payments. ADR 0035 first
 * kept the supplier register owner-only; ADR 0037 gave it to the manager on
 * the product owner's instruction, leaving the owner-only activity log as the
 * check on a supplier created and paid by one hand. `reports.read` reads.
 *
 * Every write is one `dbWrite` transaction holding its audit rows (R2, R7).
 * The multi-row writes — a PO, a bill — carry the form's idempotency key (R3):
 * a bill double-posted on a slow connection is stock counted twice and a
 * supplier paid twice.
 */

export interface PurchasingActionState {
  readonly error: string | null;
  readonly message: string | null;
}

/** A refusal decided inside the transaction; rolls it back and becomes the message. */
class Refusal extends Error {}

const optional = (value: FormDataEntryValue | null): string | null => {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
};

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.');
const FORM_KEY = z.uuid('Reload the page and try again.');

async function auditContext(actorId: string): Promise<AuditContext> {
  const context = await requestContext();
  return { actorId, ip: context.ip ?? undefined, ua: context.ua ?? undefined };
}

/** The line rows a PO or bill form posted, in screen order. */
function postedLines(form: FormData): RawLine[] {
  const items = form.getAll('line.itemId').map(String);
  const qtys = form.getAll('line.qty').map(String);
  const amounts = form.getAll('line.amount').map(String);
  const units = form.getAll('line.unit').map(String);
  return items.map((itemId, index) => ({
    itemId,
    qty: qtys[index] ?? '',
    amount: amounts[index] ?? '',
    unit: units[index] ?? '',
  }));
}

/**
 * Read, lock and validate the catalogue items a form names. Names and units
 * come from the database, never the payload, as the demand grid does.
 */
async function lockLines(
  tx: Tx,
  form: FormData,
  options: { readonly amountRequired: boolean },
): Promise<{
  readonly lines: readonly PurchaseLine[];
  readonly items: ReadonlyMap<string, { name: string; unit: string | null }>;
}> {
  const raw = postedLines(form);
  const ids = [
    ...new Set(raw.map((row) => row.itemId).filter((id) => /^[0-9a-f-]{36}$/i.test(id))),
  ];
  const rows =
    ids.length === 0
      ? []
      : await tx
          .select({ id: demandItems.id, name: demandItems.name, unit: demandItems.defaultUnit })
          .from(demandItems)
          .where(and(inArray(demandItems.id, ids), isNull(demandItems.deletedAt)))
          .for('update');
  const items = new Map(rows.map((row) => [row.id, { name: row.name, unit: row.unit }]));
  const { lines, errors } = collectLines(
    raw,
    new Map(rows.map((row) => [row.id, row.name])),
    options,
  );
  if (errors.length > 0) throw new Refusal(errors.slice(0, 3).join(' '));
  if (lines.length === 0) throw new Refusal('Add at least one item.');
  return { lines, items };
}

/* --------------------------------------------------------------- suppliers */

const SupplierInput = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(2, 'Enter the supplier’s name.').max(120),
  contactPerson: z.string().trim().max(120).nullable(),
  phone: z.string().trim().max(40).nullable(),
  address: z.string().trim().max(240).nullable(),
  ntn: z.string().trim().max(30).nullable(),
  openingBalance: z.string(),
  note: z.string().trim().max(240).nullable(),
});

/**
 * Add a supplier, or change one (owner or manager). The opening balance is editable
 * here because it is a fact about the day the book started, not a movement;
 * the audit row keeps what it was before (R7).
 */
export async function saveSupplierAction(
  _previous: PurchasingActionState,
  form: FormData,
): Promise<PurchasingActionState> {
  const operator = await requireOperator();
  assertPermission(operator, 'expenses.write');
  const parsed = SupplierInput.safeParse({
    id: optional(form.get('id')),
    name: form.get('name'),
    contactPerson: optional(form.get('contactPerson')),
    phone: optional(form.get('phone')),
    address: optional(form.get('address')),
    ntn: optional(form.get('ntn')),
    openingBalance: String(form.get('openingBalance') ?? ''),
    note: optional(form.get('note')),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Check the supplier.', message: null };
  const { id, openingBalance: openingText, ...fields } = parsed.data;
  const opening = parseOptionalRupees(openingText, 'Opening balance');
  if (typeof opening === 'string') return { error: opening, message: null };

  const audit = await auditContext(operator.id);
  try {
    await dbWrite().transaction(async (tx) => {
      const [clash] = await tx
        .select({ id: suppliers.id })
        .from(suppliers)
        .where(
          and(sql`lower(${suppliers.name}) = lower(${fields.name})`, isNull(suppliers.deletedAt)),
        );
      if (clash !== undefined && clash.id !== id)
        throw new Refusal(`A supplier called ${fields.name} already exists.`);

      if (id === null) {
        const [created] = await tx
          .insert(suppliers)
          .values({ ...fields, openingBalance: opening })
          .returning({ id: suppliers.id });
        if (created === undefined) throw new Error('Adding the supplier returned no row.');
        await writeAudit(tx, audit, {
          entity: 'suppliers',
          entityId: created.id,
          action: 'SUPPLIER_CREATED',
          after: { ...fields, openingBalance: opening.toString() },
        });
        return;
      }
      const [before] = await tx
        .select()
        .from(suppliers)
        .where(and(eq(suppliers.id, id), isNull(suppliers.deletedAt)))
        .for('update');
      if (before === undefined) throw new Refusal('That supplier no longer exists.');
      await tx
        .update(suppliers)
        .set({ ...fields, openingBalance: opening, updatedAt: new Date() })
        .where(eq(suppliers.id, id));
      await writeAudit(tx, audit, {
        entity: 'suppliers',
        entityId: id,
        action: 'SUPPLIER_CHANGED',
        before: {
          name: before.name,
          contactPerson: before.contactPerson,
          phone: before.phone,
          address: before.address,
          ntn: before.ntn,
          openingBalance: before.openingBalance.toString(),
          note: before.note,
        },
        after: { ...fields, openingBalance: opening.toString() },
      });
    });
  } catch (error) {
    if (error instanceof Refusal) return { error: error.message, message: null };
    throw error;
  }
  revalidatePath('/admin/suppliers');
  return { error: null, message: id === null ? `${fields.name} added.` : `${fields.name} saved.` };
}

/**
 * Deactivate or reactivate. A supplier with history is never deleted (R6):
 * its bills and payments still need a name to print against.
 */
export async function setSupplierActiveAction(
  supplierId: string,
  isActive: boolean,
): Promise<void> {
  const operator = await requireOperator();
  assertPermission(operator, 'expenses.write');
  if (!z.uuid().safeParse(supplierId).success) return;
  const audit = await auditContext(operator.id);
  await dbWrite().transaction(async (tx) => {
    const updated = await tx
      .update(suppliers)
      .set({ isActive, updatedAt: new Date() })
      .where(and(eq(suppliers.id, supplierId), isNull(suppliers.deletedAt)))
      .returning({ id: suppliers.id });
    if (updated.length === 0) return;
    await writeAudit(tx, audit, {
      entity: 'suppliers',
      entityId: supplierId,
      action: isActive ? 'SUPPLIER_REACTIVATED' : 'SUPPLIER_DEACTIVATED',
      after: { isActive },
    });
  });
  revalidatePath('/admin/suppliers');
  revalidatePath(`/admin/suppliers/${supplierId}`);
}

/* --------------------------------------------------------- purchase orders */

const OrderInput = z.object({
  formKey: FORM_KEY,
  supplierId: z.uuid('Choose a supplier.'),
  orderedOn: DATE,
  expectedOn: DATE.nullable(),
  note: z.string().trim().max(500).nullable(),
});

export async function createPurchaseOrderAction(
  _previous: PurchasingActionState,
  form: FormData,
): Promise<PurchasingActionState> {
  const operator = await requireOperator();
  assertPermission(operator, 'expenses.write');
  const parsed = OrderInput.safeParse({
    formKey: form.get('formKey'),
    supplierId: form.get('supplierId'),
    orderedOn: form.get('orderedOn'),
    expectedOn: optional(form.get('expectedOn')),
    note: optional(form.get('note')),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Check the order.', message: null };
  const input = parsed.data;
  if (input.expectedOn !== null && input.expectedOn < input.orderedOn)
    return { error: 'Delivery cannot be expected before the order date.', message: null };

  const audit = await auditContext(operator.id);
  let id: string;
  try {
    id = await dbWrite().transaction(async (tx) => {
      const outcome = await withIdempotency(tx, input.formKey, 'purchase_order', async () => {
        const [supplier] = await tx
          .select({ isActive: suppliers.isActive })
          .from(suppliers)
          .where(and(eq(suppliers.id, input.supplierId), isNull(suppliers.deletedAt)));
        if (supplier?.isActive !== true) throw new Refusal('That supplier is not active.');
        const { lines } = await lockLines(tx, form, { amountRequired: false });

        const [created] = await tx
          .insert(purchaseOrders)
          .values({
            supplierId: input.supplierId,
            orderedOn: input.orderedOn,
            expectedOn: input.expectedOn,
            note: input.note,
            createdBy: operator.id,
          })
          .returning({ id: purchaseOrders.id, poNo: purchaseOrders.poNo });
        if (created === undefined) throw new Error('Creating the purchase order returned no row.');
        await tx.insert(purchaseOrderLines).values(
          lines.map((line) => ({
            purchaseOrderId: created.id,
            itemId: line.itemId,
            qty: qtyToString(line.quantity),
            amount: line.amount,
          })),
        );
        await writeAudit(tx, audit, {
          entity: 'purchase_orders',
          entityId: created.id,
          action: 'PURCHASE_ORDER_CREATED',
          after: {
            poNo: created.poNo,
            supplierId: input.supplierId,
            lines: lines.map((line) => ({
              itemId: line.itemId,
              qty: qtyToString(line.quantity),
              amount: line.amount?.toString() ?? null,
            })),
          },
        });
        return { id: created.id };
      });
      return outcome.result.id;
    });
  } catch (error) {
    if (error instanceof Refusal) return { error: error.message, message: null };
    throw error;
  }
  revalidatePath('/admin/purchase-orders');
  redirect(`/admin/purchase-orders/${id}`);
}

/** Close (nothing more is coming) or cancel (should never have been sent) an open PO. */
export async function setPurchaseOrderStatusAction(
  purchaseOrderId: string,
  status: 'CLOSED' | 'CANCELLED',
): Promise<void> {
  const operator = await requireOperator();
  assertPermission(operator, 'expenses.write');
  if (!z.uuid().safeParse(purchaseOrderId).success) return;
  const audit = await auditContext(operator.id);
  await dbWrite().transaction(async (tx) => {
    // R4 — only OPEN moves, and the WHERE is the whole state machine.
    const updated = await tx
      .update(purchaseOrders)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(purchaseOrders.id, purchaseOrderId),
          eq(purchaseOrders.status, 'OPEN'),
          isNull(purchaseOrders.deletedAt),
        ),
      )
      .returning({ id: purchaseOrders.id });
    if (updated.length === 0) return;
    await writeAudit(tx, audit, {
      entity: 'purchase_orders',
      entityId: purchaseOrderId,
      action: status === 'CLOSED' ? 'PURCHASE_ORDER_CLOSED' : 'PURCHASE_ORDER_CANCELLED',
      before: { status: 'OPEN' },
      after: { status },
    });
  });
  revalidatePath('/admin/purchase-orders');
  revalidatePath(`/admin/purchase-orders/${purchaseOrderId}`);
}

/* ------------------------------------------------------------------- bills */

const BillInput = z.object({
  formKey: FORM_KEY,
  supplierId: z.uuid('Choose a supplier.'),
  purchaseOrderId: z.uuid().nullable(),
  supplierRef: z.string().trim().max(60).nullable(),
  billedOn: DATE,
  dueOn: DATE.nullable(),
  note: z.string().trim().max(500).nullable(),
});

/**
 * Post a supplier bill: the payable and the stock receipt, in one transaction.
 *
 * Each line is checked with the stock ledger's own `refuseMovement` as a
 * `RECEIVED`, so a bill line obeys exactly the rules a hand-entered receipt
 * does — a unit is required on an item's first movement, and nothing is
 * dated in the future. Against an open PO of the same supplier, the PO is
 * closed in the same transaction (runfile §3: partial deliveries are a new PO).
 */
export async function postSupplierBillAction(
  _previous: PurchasingActionState,
  form: FormData,
): Promise<PurchasingActionState> {
  const operator = await requireOperator();
  assertPermission(operator, 'expenses.write');
  const parsed = BillInput.safeParse({
    formKey: form.get('formKey'),
    supplierId: form.get('supplierId'),
    purchaseOrderId: optional(form.get('purchaseOrderId')),
    supplierRef: optional(form.get('supplierRef')),
    billedOn: form.get('billedOn'),
    dueOn: optional(form.get('dueOn')),
    note: optional(form.get('note')),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Check the bill.', message: null };
  const input = parsed.data;
  if (input.dueOn !== null && input.dueOn < input.billedOn)
    return { error: 'A bill cannot fall due before its own date.', message: null };
  const charges = parseOptionalRupees(String(form.get('charges') ?? ''), 'Other charges');
  if (typeof charges === 'string') return { error: charges, message: null };
  const discount = parseOptionalRupees(String(form.get('discount') ?? ''), 'Discount');
  if (typeof discount === 'string') return { error: discount, message: null };

  const audit = await auditContext(operator.id);
  let id: string;
  try {
    id = await dbWrite().transaction(async (tx) => {
      const outcome = await withIdempotency(tx, input.formKey, 'supplier_bill', async () => {
        const [supplier] = await tx
          .select({ name: suppliers.name, isActive: suppliers.isActive })
          .from(suppliers)
          .where(and(eq(suppliers.id, input.supplierId), isNull(suppliers.deletedAt)));
        if (supplier?.isActive !== true) throw new Refusal('That supplier is not active.');

        if (input.supplierRef !== null) {
          const [duplicate] = await tx
            .select({ billNo: supplierBills.billNo })
            .from(supplierBills)
            .where(
              and(
                eq(supplierBills.supplierId, input.supplierId),
                sql`lower(${supplierBills.supplierRef}) = lower(${input.supplierRef})`,
                eq(supplierBills.status, 'POSTED'),
                isNull(supplierBills.deletedAt),
              ),
            );
          // The partial unique index refuses it anyway; this says which bill.
          if (duplicate !== undefined)
            throw new Refusal(
              `${supplier.name}'s invoice ${input.supplierRef} is already entered as bill #${duplicate.billNo}.`,
            );
        }

        if (input.purchaseOrderId !== null) {
          const [order] = await tx
            .select({ supplierId: purchaseOrders.supplierId, status: purchaseOrders.status })
            .from(purchaseOrders)
            .where(
              and(eq(purchaseOrders.id, input.purchaseOrderId), isNull(purchaseOrders.deletedAt)),
            )
            .for('update');
          if (order?.status !== 'OPEN') throw new Refusal('That purchase order is no longer open.');
          if (order.supplierId !== input.supplierId)
            throw new Refusal('That purchase order is for a different supplier.');
        }

        const { lines, items } = await lockLines(tx, form, { amountRequired: true });
        const today = await currentBusinessDate(tx);
        const books = await readBooks(
          tx,
          lines.map((line) => line.itemId),
        );
        const problems: string[] = [];
        for (const line of lines) {
          const item = items.get(line.itemId);
          if (item === undefined) continue;
          const refusal = refuseMovement({
            name: item.name,
            kind: 'RECEIVED',
            quantity: line.quantity,
            book: books.get(line.itemId) ?? qty(0n),
            unit: item.unit ?? line.unit,
            note: null,
            occurredOn: input.billedOn,
            today,
          });
          if (refusal !== null) problems.push(refusal);
        }
        if (problems.length > 0) throw new Refusal(problems.slice(0, 3).join(' '));

        const total = billTotal(
          lines.map((line) => line.amount ?? paisa(0n)),
          charges,
          discount,
        );
        if (total < 0n) throw new Refusal('The discount is larger than the bill.');

        const [created] = await tx
          .insert(supplierBills)
          .values({
            supplierId: input.supplierId,
            purchaseOrderId: input.purchaseOrderId,
            supplierRef: input.supplierRef,
            billedOn: input.billedOn,
            dueOn: input.dueOn,
            charges,
            discount,
            total,
            note: input.note,
            createdBy: operator.id,
          })
          .returning({ id: supplierBills.id, billNo: supplierBills.billNo });
        if (created === undefined) throw new Error('Posting the bill returned no row.');
        await tx.insert(supplierBillLines).values(
          lines.map((line) => ({
            billId: created.id,
            itemId: line.itemId,
            qty: qtyToString(line.quantity),
            amount: line.amount ?? paisa(0n),
          })),
        );
        await writeAudit(tx, audit, {
          entity: 'supplier_bills',
          entityId: created.id,
          action: 'SUPPLIER_BILL_POSTED',
          after: {
            billNo: created.billNo,
            supplierId: input.supplierId,
            supplierRef: input.supplierRef,
            purchaseOrderId: input.purchaseOrderId,
            total: total.toString(),
          },
        });

        // ADR 0035 — the goods on the bill are the goods received. The note
        // names the bill, so the item's history says where the stock came from.
        const note = `Bill #${created.billNo} — ${supplier.name}`;
        for (const line of lines) {
          const item = items.get(line.itemId);
          if (item === undefined) continue;
          if (item.unit === null && line.unit !== null)
            await saveUnit(tx, audit, line.itemId, line.unit);
          await insertMovement(tx, audit, {
            itemId: line.itemId,
            kind: 'RECEIVED',
            quantity: line.quantity,
            delta: line.quantity,
            book: books.get(line.itemId) ?? qty(0n),
            occurredOn: input.billedOn,
            note,
            recordedBy: operator.id,
          });
        }

        if (input.purchaseOrderId !== null) {
          await tx
            .update(purchaseOrders)
            .set({ status: 'CLOSED', updatedAt: new Date() })
            .where(eq(purchaseOrders.id, input.purchaseOrderId));
          await writeAudit(tx, audit, {
            entity: 'purchase_orders',
            entityId: input.purchaseOrderId,
            action: 'PURCHASE_ORDER_CLOSED',
            before: { status: 'OPEN' },
            after: { status: 'CLOSED', billId: created.id },
          });
        }
        return { id: created.id };
      });
      return outcome.result.id;
    });
  } catch (error) {
    if (error instanceof Refusal) return { error: error.message, message: null };
    throw error;
  }
  revalidatePath('/admin/purchases');
  revalidatePath('/admin/suppliers');
  revalidatePath('/admin/stock');
  revalidatePath('/admin/purchase-orders');
  redirect(`/admin/purchases/${id}`);
}

/**
 * Cancel a posted bill. The counter-entry, never a delete (R6): the bill stays
 * on the list marked cancelled, drops out of the supplier's balance, and each
 * line goes back out of stock as `RETURNED`, dated today.
 *
 * Refused when any line's stock has already been used — the book would go
 * negative, and ADR 0034 has no negative stock. A count, or a smaller
 * correcting bill, is the honest route then.
 */
export async function cancelSupplierBillAction(
  billId: string,
  _previous: PurchasingActionState,
  form: FormData,
): Promise<PurchasingActionState> {
  const operator = await requireOperator();
  assertPermission(operator, 'expenses.write');
  if (!z.uuid().safeParse(billId).success) return { error: 'No such bill.', message: null };
  const reason = optional(form.get('cancelReason'));
  if (reason === null || reason.length < 3)
    return { error: 'Say why the bill is being cancelled.', message: null };

  const audit = await auditContext(operator.id);
  try {
    await dbWrite().transaction(async (tx) => {
      const [bill] = await tx
        .select({ billNo: supplierBills.billNo, status: supplierBills.status })
        .from(supplierBills)
        .where(and(eq(supplierBills.id, billId), isNull(supplierBills.deletedAt)))
        .for('update');
      if (bill?.status !== 'POSTED') throw new Refusal('That bill is already cancelled.');

      const lines = await tx
        .select({ itemId: supplierBillLines.itemId, qty: supplierBillLines.qty })
        .from(supplierBillLines)
        .where(and(eq(supplierBillLines.billId, billId), isNull(supplierBillLines.deletedAt)));
      const itemIds = lines.map((line) => line.itemId);
      const items = await tx
        .select({ id: demandItems.id, name: demandItems.name, unit: demandItems.defaultUnit })
        .from(demandItems)
        .where(inArray(demandItems.id, itemIds))
        .for('update');
      const byId = new Map(items.map((item) => [item.id, item]));
      const books = await readBooks(tx, itemIds);
      const today = await currentBusinessDate(tx);

      const problems: string[] = [];
      for (const line of lines) {
        const item = byId.get(line.itemId);
        const quantity = parseQty(line.qty);
        const refusal = refuseMovement({
          name: item?.name ?? 'An item',
          kind: 'RETURNED',
          quantity,
          book: books.get(line.itemId) ?? qty(0n),
          unit: item?.unit ?? null,
          note: null,
          occurredOn: today,
          today,
        });
        if (refusal !== null) problems.push(refusal);
      }
      if (problems.length > 0)
        throw new Refusal(
          `Some of this stock is already used, so it cannot go back. ${problems.slice(0, 2).join(' ')}`,
        );

      const now = new Date();
      await tx
        .update(supplierBills)
        .set({
          status: 'CANCELLED',
          cancelledAt: now,
          cancelledBy: operator.id,
          cancelReason: reason,
          updatedAt: now,
        })
        .where(eq(supplierBills.id, billId));
      await writeAudit(tx, audit, {
        entity: 'supplier_bills',
        entityId: billId,
        action: 'SUPPLIER_BILL_CANCELLED',
        before: { status: 'POSTED' },
        after: { status: 'CANCELLED', reason },
      });
      for (const line of lines) {
        const quantity = parseQty(line.qty);
        await insertMovement(tx, audit, {
          itemId: line.itemId,
          kind: 'RETURNED',
          quantity,
          delta: qty(-quantity),
          book: books.get(line.itemId) ?? qty(0n),
          occurredOn: today,
          note: `Bill #${bill.billNo} cancelled — ${reason}`,
          recordedBy: operator.id,
        });
      }
    });
  } catch (error) {
    if (error instanceof Refusal) return { error: error.message, message: null };
    throw error;
  }
  revalidatePath('/admin/purchases');
  revalidatePath(`/admin/purchases/${billId}`);
  revalidatePath('/admin/suppliers');
  revalidatePath('/admin/stock');
  return { error: null, message: 'Bill cancelled and its stock returned.' };
}

/* ---------------------------------------------------------------- payments */

const PaymentInput = z.object({
  formKey: FORM_KEY,
  supplierId: z.uuid('Choose a supplier.'),
  amount: z.string().trim().min(1, 'Enter an amount.'),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'WALLET']),
  reference: z.string().trim().max(60).nullable(),
  paidOn: DATE,
  throughTill: z.boolean(),
  note: z.string().trim().max(240).nullable(),
});

/**
 * Pay a supplier. Cash from the drawer writes a `PAY_OUT` on the open shift
 * in the same transaction, linked from the payment, exactly as ADR 0033 does
 * for a staff advance — `computeExpectedCash()` nets it with no change to M12.
 *
 * Not an expense, deliberately: the bill already recorded what was bought.
 * Writing the payment to `expenses` as well would count the purchase twice.
 */
export async function recordSupplierPaymentAction(
  _previous: PurchasingActionState,
  form: FormData,
): Promise<PurchasingActionState> {
  const operator = await requireOperator();
  assertPermission(operator, 'expenses.write');
  const parsed = PaymentInput.safeParse({
    formKey: form.get('formKey'),
    supplierId: form.get('supplierId'),
    amount: form.get('amount'),
    method: form.get('method'),
    reference: optional(form.get('reference')),
    paidOn: form.get('occurredOn'),
    throughTill: form.get('throughTill') === 'on',
    note: optional(form.get('note')),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Check the payment.', message: null };
  const input = parsed.data;
  let amount: Paisa;
  try {
    amount = parsePaisa(input.amount.replace(/,/g, ''));
  } catch {
    return { error: 'Enter an amount in rupees, e.g. 40000 or 2500.50.', message: null };
  }

  const audit = await auditContext(operator.id);
  try {
    const name = await dbWrite().transaction(async (tx) => {
      const outcome = await withIdempotency(tx, input.formKey, 'supplier_payment', async () => {
        // The lock that makes the balance check true: two payments saved at
        // once would each read the old balance and both pass.
        const [supplier] = await tx
          .select({ name: suppliers.name, openingBalance: suppliers.openingBalance })
          .from(suppliers)
          .where(and(eq(suppliers.id, input.supplierId), isNull(suppliers.deletedAt)))
          .for('update');
        if (supplier === undefined) throw new Refusal('That supplier no longer exists.');
        const [bills, pays] = await Promise.all([
          tx
            .select({ total: supplierBills.total })
            .from(supplierBills)
            .where(
              and(
                eq(supplierBills.supplierId, input.supplierId),
                eq(supplierBills.status, 'POSTED'),
                isNull(supplierBills.deletedAt),
              ),
            ),
          tx
            .select({ amount: supplierPayments.amount })
            .from(supplierPayments)
            .where(
              and(
                eq(supplierPayments.supplierId, input.supplierId),
                isNull(supplierPayments.deletedAt),
              ),
            ),
        ]);
        const { balance } = supplierBalance(
          paisa(supplier.openingBalance),
          bills.map((b) => paisa(b.total)),
          pays.map((p) => paisa(p.amount)),
        );
        const refusal = refuseSettlement({
          amount,
          method: input.method,
          throughTill: input.throughTill,
          occurredOn: input.paidOn,
          today: await currentBusinessDate(tx),
          balance,
        });
        if (refusal !== null) throw new Refusal(refusal);

        let cashMovementId: string | null = null;
        if (input.throughTill) {
          // Locked so the drawer cannot close between this read and the insert.
          const [shift] = await tx
            .select({ id: shifts.id })
            .from(shifts)
            .where(eq(shifts.status, 'OPEN'))
            .for('update');
          if (shift === undefined)
            throw new Refusal('No shift is open, so the till cannot have paid this.');
          const reason = `Supplier payment — ${supplier.name}`;
          const [movement] = await tx
            .insert(cashMovements)
            .values({ shiftId: shift.id, type: 'PAY_OUT', amount, reason, actorId: operator.id })
            .returning({ id: cashMovements.id });
          if (movement === undefined)
            throw new Error('Recording the till movement returned no row.');
          await writeAudit(tx, audit, {
            entity: 'cash_movements',
            entityId: movement.id,
            action: 'PAY_OUT',
            after: { shiftId: shift.id, amount: amount.toString(), reason },
          });
          cashMovementId = movement.id;
        }

        const [created] = await tx
          .insert(supplierPayments)
          .values({
            supplierId: input.supplierId,
            amount,
            method: input.method,
            reference: input.reference,
            paidOn: input.paidOn,
            cashMovementId,
            note: input.note,
            recordedBy: operator.id,
          })
          .returning({ id: supplierPayments.id });
        if (created === undefined) throw new Error('Recording the payment returned no row.');
        await writeAudit(tx, audit, {
          entity: 'supplier_payments',
          entityId: created.id,
          action: 'SUPPLIER_PAID',
          after: {
            supplierId: input.supplierId,
            amount: amount.toString(),
            method: input.method,
            paidOn: input.paidOn,
            cashMovementId,
          },
        });
        return { name: supplier.name };
      });
      return outcome.result.name;
    });
    revalidatePath('/admin/suppliers');
    revalidatePath(`/admin/suppliers/${input.supplierId}`);
    if (input.throughTill) {
      revalidatePath('/shift');
      revalidatePath('/admin/shift');
    }
    return {
      error: null,
      message: `Payment to ${name} recorded${input.throughTill ? ' and taken from the till' : ''}.`,
    };
  } catch (error) {
    if (error instanceof Refusal) return { error: error.message, message: null };
    throw error;
  }
}
