import { and, eq, isNull } from 'drizzle-orm';
import type { DbRead, Tx } from '@natech/db';
import {
  customers,
  orderLineModifiers,
  orderLines,
  orders,
  tables,
  taxClasses,
  users,
  zones,
} from '@natech/db';
import { paisa, parseQty, type OrderLine as DomainOrderLine, type OrderType } from '@natech/domain';
import type { Order, TaxClassKey } from '@natech/contracts';
import { initialsOf } from '../auth/queries';
import { currentOrderStatus, type PersistedOrderStatus } from './status';

/**
 * Load one order's real, persisted lines for pricing and for display — used
 * by `finalizeOrderAction` (docs/runfiles/M10-check-and-payment.md §3:
 * "recomputes from `order_lines`, never from a client-submitted total").
 *
 * Mirrors `lib/orders/queries.ts`'s `listTrayOrders`/`findOrderSummary`
 * mapper exactly: a voided line is excluded, not zeroed-and-kept — the same
 * choice `TaxInvoiceReceipt` already makes at render time
 * (`priced.filter((line) => line.line.isVoid !== true)`), so nothing here
 * needs `OrderLine.isVoid` at all.
 *
 * `orderDiscount`/`discountReason` read straight off `orders` (ADR 0017) —
 * `setOrderDiscountAction` is the one place that writes them, so
 * `finalizeOrderAction` picks up whatever `DiscountDialog` last set with no
 * parameter of its own. `listTrayOrders`/`findOrderSummary` still don't
 * surface it: neither the tray card nor the floor chip prices a discount,
 * only this function and `OrderScreen`'s own local preview do.
 */
export interface PriceableOrder {
  readonly order: Order;
  readonly domainLines: readonly DomainOrderLine[];
}

const DEFAULT_TAX_CLASS_KEY: TaxClassKey = 'STANDARD_FOOD';

/**
 * Accepts a transaction (`finalizeOrderAction`, R2's own write-path
 * discipline) or a plain `dbRead()` client (`(terminal)/page.tsx` pricing an
 * already-placed order for display — a pure read, never a mutation, so
 * `dbRead` is the correct client here, not a workaround).
 */
export async function loadPriceableOrder(
  tx: Tx | DbRead,
  orderId: string,
): Promise<PriceableOrder | null> {
  const orderRows = await tx
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      channel: orders.channel,
      type: orders.type,
      status: orders.status,
      tableId: orders.tableId,
      tableSessionId: orders.tableSessionId,
      customerId: orders.customerId,
      waiterId: orders.waiterId,
      guestCount: orders.guestCount,
      note: orders.note,
      orderDiscount: orders.orderDiscount,
      discountReason: orders.discountReason,
      deliveryAddress: orders.deliveryAddress,
      deliveryCharge: orders.deliveryCharge,
      serviceChargeBpsOverride: orders.serviceChargeBpsOverride,
      clientOrderUuid: orders.clientOrderUuid,
      businessDate: orders.businessDate,
      serviceStartedAt: orders.serviceStartedAt,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)));

  const row = orderRows[0];
  // No round has ever been placed, so there is no service time to resolve a
  // rate against (§6.7) — nothing here can be finalized yet.
  if (row === undefined || row.serviceStartedAt === null) return null;

  const [lineRows, modifierRows, taxClassRows, tableWithZone, waiterName, customer] =
    await Promise.all([
      tx
        .select({
          id: orderLines.id,
          nameSnapshot: orderLines.nameSnapshot,
          nameUrSnapshot: orderLines.nameUrSnapshot,
          menuItemId: orderLines.menuItemId,
          variantId: orderLines.variantId,
          qty: orderLines.qty,
          unitPrice: orderLines.unitPrice,
          lineDiscount: orderLines.lineDiscount,
          taxClassId: orderLines.taxClassId,
          seatNo: orderLines.seatNo,
          note: orderLines.note,
          voidReason: orderLines.voidReason,
        })
        .from(orderLines)
        .where(and(eq(orderLines.orderId, orderId), isNull(orderLines.deletedAt))),
      tx
        .select({
          id: orderLineModifiers.id,
          orderLineId: orderLineModifiers.orderLineId,
          modifierId: orderLineModifiers.modifierId,
          nameSnapshot: orderLineModifiers.nameSnapshot,
          nameUrSnapshot: orderLineModifiers.nameUrSnapshot,
          priceDelta: orderLineModifiers.priceDelta,
        })
        .from(orderLineModifiers)
        .innerJoin(orderLines, eq(orderLines.id, orderLineModifiers.orderLineId))
        .where(
          and(
            eq(orderLines.orderId, orderId),
            isNull(orderLines.deletedAt),
            isNull(orderLineModifiers.deletedAt),
          ),
        ),
      tx.select({ id: taxClasses.id, key: taxClasses.key }).from(taxClasses),
      // Joined rather than a `tables` fetch followed by a `zones` fetch on
      // its result — folding this in saves a full extra sequential network
      // round trip on every order that has a table, on top of the one this
      // already saved by running concurrently with the other five reads
      // above (2026-09-01, alongside the "View Booked Orders" fix — every
      // round trip here costs real seconds once app and database are not in
      // the same region, which they currently are not).
      row.tableId === null
        ? Promise.resolve(null)
        : tx
            .select({ id: tables.id, code: tables.code, zoneName: zones.name })
            .from(tables)
            .leftJoin(zones, eq(zones.id, tables.zoneId))
            .where(eq(tables.id, row.tableId))
            .then((rows) => rows[0] ?? null),
      row.waiterId === null
        ? Promise.resolve(null)
        : tx
            .select({ displayName: users.displayName })
            .from(users)
            .where(eq(users.id, row.waiterId))
            .then((rows) => rows[0]?.displayName ?? null),
      row.customerId === null
        ? Promise.resolve(null)
        : tx
            .select({ name: customers.name, phone: customers.phone })
            .from(customers)
            .where(eq(customers.id, row.customerId))
            .then((rows) => rows[0] ?? null),
    ]);

  const taxKeyById = new Map(taxClassRows.map((r) => [r.id, r.key as TaxClassKey]));
  const modifiersByLine = new Map<string, typeof modifierRows>();
  for (const modifier of modifierRows) {
    const bucket = modifiersByLine.get(modifier.orderLineId) ?? [];
    bucket.push(modifier);
    modifiersByLine.set(modifier.orderLineId, bucket);
  }

  const activeLines = lineRows.filter((line) => line.voidReason === null);

  const domainLines: DomainOrderLine[] = activeLines.map((line) => ({
    id: line.id,
    name: line.nameSnapshot,
    taxClass: taxKeyById.get(line.taxClassId ?? '') ?? DEFAULT_TAX_CLASS_KEY,
    unitPrice: paisa(line.unitPrice),
    qty: parseQty(line.qty),
    lineDiscount: paisa(line.lineDiscount),
    modifiers: (modifiersByLine.get(line.id) ?? []).map((modifier) => ({
      name: modifier.nameSnapshot,
      priceDelta: paisa(modifier.priceDelta),
    })),
  }));

  const orderLinesView = activeLines.map((line) => ({
    id: line.id,
    menuItemId: line.menuItemId,
    variantId: line.variantId,
    nameSnapshot: line.nameSnapshot,
    nameUrSnapshot: line.nameUrSnapshot,
    variantLabel: null,
    qty: parseQty(line.qty),
    unitPrice: paisa(line.unitPrice),
    lineDiscount: paisa(line.lineDiscount),
    taxClass: taxKeyById.get(line.taxClassId ?? '') ?? DEFAULT_TAX_CLASS_KEY,
    seatNo: line.seatNo,
    note: line.note,
    voidReason: line.voidReason,
    modifiers: (modifiersByLine.get(line.id) ?? []).map((modifier) => ({
      id: modifier.id,
      modifierId: modifier.modifierId,
      nameSnapshot: modifier.nameSnapshot,
      nameUrSnapshot: modifier.nameUrSnapshot,
      priceDelta: paisa(modifier.priceDelta),
    })),
  }));

  const order: Order = {
    id: row.id,
    orderNo: row.orderNo,
    channel: row.channel,
    type: row.type,
    status: currentOrderStatus(row.status as PersistedOrderStatus),
    tableId: row.tableId,
    tableCode: tableWithZone?.code ?? null,
    zoneName: tableWithZone?.zoneName ?? null,
    tableSessionId: row.tableSessionId,
    customerName: customer?.name ?? null,
    customerPhone: customer?.phone ?? null,
    waiterInitials: waiterName === null ? null : initialsOf(waiterName),
    guestCount: row.guestCount,
    note: row.note,
    // Never null in practice — every real order is created with one
    // (`placeOrderAction`) — but the column is nullable, so a defensive
    // fallback keeps this a total function rather than an assertion.
    clientOrderUuid: row.clientOrderUuid ?? '00000000-0000-4000-8000-000000000000',
    businessDate: row.businessDate ?? '',
    serviceStartedAt: row.serviceStartedAt,
    openedAt: row.createdAt,
    lines: orderLinesView,
    orderDiscount: paisa(row.orderDiscount),
    discountReason: row.discountReason,
    deliveryAddress: row.deliveryAddress,
    deliveryCharge: paisa(row.deliveryCharge),
    serviceChargeBpsOverride: row.serviceChargeBpsOverride,
  };

  return { order, domainLines };
}

/** `orders.type` already matches `@natech/domain`'s `OrderType` — see `apps/pos/lib/orders/actions.ts`'s own use of it as-is. */
export function orderTypeOf(order: Order): OrderType {
  return order.type;
}
