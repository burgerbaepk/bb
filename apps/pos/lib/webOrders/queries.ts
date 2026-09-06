import 'server-only';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import {
  customers,
  dbRead,
  orderLineModifiers,
  orderLines,
  orders,
  tables,
  taxClasses,
} from '@natech/db';
import { extend, paisa, parseQty, sum, type TaxClassKey } from '@natech/domain';
import type { OrderLine, WebOrder } from '@natech/contracts';

/**
 * The web-order inbox's read side — BUILD-PLAN.md §13.4, R16;
 * docs/runfiles/M14-storefront.md §3.
 *
 * `decision`/`rejectReason` are derived, never stored — mirrors the identical
 * derivation `apps/storefront/lib/orders/queries.ts` uses for the customer's
 * own status page, from the same two facts: `orders.status` and the order's
 * lines' own `voidReason`.
 *
 * `customerName` still falls back to the email when absent, because rows placed
 * before ADR 0022 have no name — sign-up collects one now, along with the phone
 * and the address, so the fallback is history rather than the normal case.
 *
 * The phone and the address are why ADR 0022 reopened `WebOrderSchema`: a
 * take-away order arrives with no table, and staff could previously accept one
 * and then have no way at all of reaching the person who placed it.
 */
export async function readWebOrders(): Promise<WebOrder[]> {
  const orderRows = await dbRead()
    .select({
      id: orders.id,
      publicId: orders.clientOrderUuid,
      orderNo: orders.orderNo,
      status: orders.status,
      createdAt: orders.createdAt,
      note: orders.note,
      tableCode: tables.code,
      customerName: customers.name,
      customerEmail: customers.email,
      customerPhone: customers.phone,
      customerAddress: customers.address,
    })
    .from(orders)
    .leftJoin(tables, eq(orders.tableId, tables.id))
    .leftJoin(customers, eq(orders.customerId, customers.id))
    .where(and(eq(orders.channel, 'WEB'), isNull(orders.deletedAt)));

  if (orderRows.length === 0) return [];

  const orderIds = orderRows.map((row) => row.id);
  const lineRows = await dbRead()
    .select({
      id: orderLines.id,
      orderId: orderLines.orderId,
      menuItemId: orderLines.menuItemId,
      variantId: orderLines.variantId,
      nameSnapshot: orderLines.nameSnapshot,
      nameUrSnapshot: orderLines.nameUrSnapshot,
      qty: orderLines.qty,
      unitPrice: orderLines.unitPrice,
      lineDiscount: orderLines.lineDiscount,
      taxClassKey: taxClasses.key,
      seatNo: orderLines.seatNo,
      note: orderLines.note,
      voidReason: orderLines.voidReason,
    })
    .from(orderLines)
    .leftJoin(taxClasses, eq(orderLines.taxClassId, taxClasses.id))
    .where(and(inArray(orderLines.orderId, orderIds), isNull(orderLines.deletedAt)));

  const modifierRows = await dbRead()
    .select({
      id: orderLineModifiers.id,
      orderLineId: orderLineModifiers.orderLineId,
      modifierId: orderLineModifiers.modifierId,
      nameSnapshot: orderLineModifiers.nameSnapshot,
      nameUrSnapshot: orderLineModifiers.nameUrSnapshot,
      priceDelta: orderLineModifiers.priceDelta,
    })
    .from(orderLineModifiers)
    .where(
      inArray(
        orderLineModifiers.orderLineId,
        lineRows.map((row) => row.id),
      ),
    );
  const modifiersByLine = new Map<string, typeof modifierRows>();
  for (const row of modifierRows) {
    const list = modifiersByLine.get(row.orderLineId) ?? [];
    list.push(row);
    modifiersByLine.set(row.orderLineId, list);
  }

  const linesByOrder = new Map<string, OrderLine[]>();
  for (const row of lineRows) {
    const list = linesByOrder.get(row.orderId) ?? [];
    list.push({
      id: row.id,
      menuItemId: row.menuItemId,
      variantId: row.variantId,
      nameSnapshot: row.nameSnapshot,
      // `order_lines` has no dedicated variant-label column (frozen M02) —
      // the label is already folded into `nameSnapshot` at placement time.
      variantLabel: null,
      nameUrSnapshot: row.nameUrSnapshot,
      qty: parseQty(row.qty),
      unitPrice: paisa(row.unitPrice),
      lineDiscount: paisa(row.lineDiscount),
      // `taxClasses.key` is a plain `text` column (no DB enum) — cast the
      // same way `apps/pos/lib/reports/tax.ts`'s own `readTaxLiability` does.
      taxClass: (row.taxClassKey ?? 'STANDARD_FOOD') as TaxClassKey,
      seatNo: row.seatNo,
      note: row.note,
      voidReason: row.voidReason,
      modifiers: (modifiersByLine.get(row.id) ?? []).map((modifier) => ({
        id: modifier.id,
        modifierId: modifier.modifierId,
        nameSnapshot: modifier.nameSnapshot,
        nameUrSnapshot: modifier.nameUrSnapshot,
        priceDelta: paisa(modifier.priceDelta),
      })),
    });
    linesByOrder.set(row.orderId, list);
  }

  return orderRows
    .map((row) => {
      const lines = linesByOrder.get(row.id) ?? [];
      const subtotalExTax = sum(
        lines.map((line) => paisa(extend(line.unitPrice, line.qty) - line.lineDiscount)),
      );
      const rejectReason = lines.find((line) => line.voidReason !== null)?.voidReason ?? null;
      const decision: WebOrder['decision'] =
        row.status === 'VOIDED' ? 'REJECTED' : row.status === 'PLACED' ? 'PENDING' : 'ACCEPTED';

      return {
        orderId: row.id,
        publicId: row.publicId ?? row.id,
        orderNo: row.orderNo,
        placedAt: row.createdAt,
        customerName: row.customerName ?? row.customerEmail ?? 'Unknown',
        customerEmail: row.customerEmail ?? '',
        customerPhone: row.customerPhone,
        customerAddress: row.customerAddress,
        tableCode: row.tableCode,
        itemCount: lines.length,
        subtotalExTax,
        lines,
        note: row.note,
        decision,
        rejectReason,
      } satisfies WebOrder;
    })
    .sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime());
}

/**
 * The web orders still waiting on a human — BUILD-PLAN.md §13.4, §16, R16.
 *
 * The shell's "Web orders" badge and the audible alert both read this, so the
 * number on the nav and the number the buzzer is ringing about are the same
 * query. That was not true before: `(terminal)/layout.tsx` filtered
 * `MOCK_WEB_ORDERS` for its badge, so the count on a live till was a constant
 * from the Phase-1 fixture set and moved for no real order — defect C4 alive
 * in a shipped surface, and the reason a QR order could arrive with the badge
 * showing nothing new. `mock-data-grep` did not catch it because the gate bans
 * mock *definitions* outside `mocks/`, not production code importing them.
 *
 * Deliberately narrow — id, number, table, time. It runs on every terminal
 * screen every few seconds; it must not drag every line and modifier of every
 * web order ever placed behind it the way `readWebOrders` legitimately does
 * for the inbox itself.
 *
 * `PLACED` **is** the pending state, the same derivation `readWebOrders`
 * makes: accepting moves the order to `SERVED`, rejecting to `VOIDED`, so an
 * order still `PLACED` is one nobody has decided about.
 */
export interface PendingWebOrder {
  readonly orderId: string;
  readonly orderNo: number;
  readonly tableCode: string | null;
  readonly placedAt: Date;
}

export async function readPendingWebOrders(): Promise<readonly PendingWebOrder[]> {
  const rows = await dbRead()
    .select({
      orderId: orders.id,
      orderNo: orders.orderNo,
      tableCode: tables.code,
      placedAt: orders.createdAt,
    })
    .from(orders)
    .leftJoin(tables, eq(orders.tableId, tables.id))
    .where(and(eq(orders.channel, 'WEB'), eq(orders.status, 'PLACED'), isNull(orders.deletedAt)))
    // Oldest first: the one that has been waiting longest is the one to act on.
    .orderBy(asc(orders.createdAt));

  return rows;
}
