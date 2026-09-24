import 'server-only';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import {
  customers,
  dbRead,
  orderLineModifiers,
  orderLines,
  orders,
  tables,
  taxClasses,
  users,
  zones,
} from '@natech/db';
import {
  computeTotals,
  linesSubtotal,
  paisa,
  parseQty,
  priceLines,
  type Paisa,
} from '@natech/domain';
import { can, type TaxClassKey, type TrayOrder, type Viewer } from '@natech/contracts';
import { initialsOf } from '../auth/queries';
import { currentOrderStatus, type PersistedOrderStatus } from './status';
import { workableOrder } from './workable';
import { listZones } from '../floor/queries';
import { readTaxPolicy, readTaxRules, withServiceChargeOverride } from '../tax/queries';

/**
 * Reads behind the order screen and the active-orders tray — BUILD-PLAN.md
 * §11.3; docs/runfiles/M09b-floor-live.md §3.
 *
 * `dbRead` throughout (R2): everything here answers a React Server Component
 * render of `(terminal)/page.tsx` or `(terminal)/orders/page.tsx` — a
 * mutation may never read through the HTTP driver, so `actions.ts` never
 * calls into this file for its own transactional reads.
 */

/* --------------------------------------------------------------- the tray */

const DEFAULT_TAX_CLASS_KEY: TaxClassKey = 'STANDARD_FOOD';

function elapsedSeconds(since: Date): number {
  return Math.max(0, Math.floor((Date.now() - since.getTime()) / 1000));
}

/** The shell header's badge (§11.1) — every open order, any channel. */
export async function activeOrderCount(): Promise<number> {
  const rows = await dbRead().select({ id: orders.id }).from(orders).where(workableOrder());
  return rows.length;
}

/**
 * The active-orders tray — BUILD-PLAN.md §11.3, R16.
 *
 * Same subtotal source as `lib/floor/queries.ts`'s `listFloorChips`
 * (`priceLines`/`linesSubtotal`, never hand-summed).
 */
export async function listTrayOrders(viewer: Viewer): Promise<readonly TrayOrder[]> {
  const db = dbRead();

  const orderRows = await db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      channel: orders.channel,
      type: orders.type,
      status: orders.status,
      tableId: orders.tableId,
      guestCount: orders.guestCount,
      waiterId: orders.waiterId,
      orderDiscount: orders.orderDiscount,
      deliveryAddress: orders.deliveryAddress,
      deliveryCharge: orders.deliveryCharge,
      serviceChargeBpsOverride: orders.serviceChargeBpsOverride,
      serviceStartedAt: orders.serviceStartedAt,
      createdAt: orders.createdAt,
      customerName: customers.name,
      customerPhone: customers.phone,
    })
    .from(orders)
    // ADR 0028 — the card used to print "Walk-in Customer" for every order,
    // including a delivery the cashier had attached a named customer to.
    .leftJoin(customers, eq(customers.id, orders.customerId))
    .where(workableOrder());

  if (orderRows.length === 0) return [];

  const orderIds = orderRows.map((row) => row.id);
  const tableIds = [
    ...new Set(orderRows.flatMap((row) => (row.tableId === null ? [] : [row.tableId]))),
  ];
  const waiterIds = [
    ...new Set(orderRows.flatMap((row) => (row.waiterId === null ? [] : [row.waiterId]))),
  ];

  const [lineRows, modifierRows, tableRows, waiterRows, taxClassRows, taxRules, taxPolicy] =
    await Promise.all([
      db
        .select({
          id: orderLines.id,
          orderId: orderLines.orderId,
          nameSnapshot: orderLines.nameSnapshot,
          qty: orderLines.qty,
          unitPrice: orderLines.unitPrice,
          lineDiscount: orderLines.lineDiscount,
          taxClassId: orderLines.taxClassId,
          voidReason: orderLines.voidReason,
        })
        .from(orderLines)
        .where(and(inArray(orderLines.orderId, orderIds), isNull(orderLines.deletedAt))),
      db
        .select({
          orderLineId: orderLineModifiers.orderLineId,
          priceDelta: orderLineModifiers.priceDelta,
        })
        .from(orderLineModifiers)
        .innerJoin(orderLines, eq(orderLines.id, orderLineModifiers.orderLineId))
        .where(
          and(
            inArray(orderLines.orderId, orderIds),
            isNull(orderLines.deletedAt),
            isNull(orderLineModifiers.deletedAt),
          ),
        ),
      tableIds.length === 0
        ? []
        : db
            .select({ id: tables.id, code: tables.code, zoneId: tables.zoneId })
            .from(tables)
            .where(inArray(tables.id, tableIds)),
      waiterIds.length === 0
        ? []
        : db
            .select({ id: users.id, displayName: users.displayName })
            .from(users)
            .where(inArray(users.id, waiterIds)),
      db.select({ id: taxClasses.id, key: taxClasses.key }).from(taxClasses),
      readTaxRules(),
      readTaxPolicy(),
    ]);

  const zoneIds = [...new Set(tableRows.map((row) => row.zoneId))];
  const zoneRows =
    zoneIds.length === 0
      ? []
      : await db
          .select({ id: zones.id, name: zones.name })
          .from(zones)
          .where(inArray(zones.id, zoneIds));
  const zoneNameById = new Map(zoneRows.map((row) => [row.id, row.name]));
  const tableById = new Map(tableRows.map((row) => [row.id, row]));
  const waiterNameById = new Map(waiterRows.map((row) => [row.id, row.displayName]));
  const taxKeyById = new Map(taxClassRows.map((row) => [row.id, row.key as TaxClassKey]));

  const modifiersByLine = new Map<string, { name: string; priceDelta: Paisa }[]>();
  for (const row of modifierRows) {
    const bucket = modifiersByLine.get(row.orderLineId) ?? [];
    bucket.push({ name: '', priceDelta: paisa(row.priceDelta) });
    modifiersByLine.set(row.orderLineId, bucket);
  }
  const linesByOrder = new Map<string, typeof lineRows>();
  for (const line of lineRows) {
    const bucket = linesByOrder.get(line.orderId) ?? [];
    bucket.push(line);
    linesByOrder.set(line.orderId, bucket);
  }

  const maySeeMoney = can(viewer, 'payment.take') || can(viewer, 'reports.read');

  return orderRows.map((order): TrayOrder => {
    const activeLines = (linesByOrder.get(order.id) ?? []).filter(
      (line) => line.voidReason === null,
    );
    const table = order.tableId === null ? null : (tableById.get(order.tableId) ?? null);
    const waiterName =
      order.waiterId === null ? null : (waiterNameById.get(order.waiterId) ?? null);

    const domainLines = activeLines.map((line) => ({
      id: line.id,
      name: line.nameSnapshot,
      taxClass: taxKeyById.get(line.taxClassId ?? '') ?? DEFAULT_TAX_CLASS_KEY,
      unitPrice: paisa(line.unitPrice),
      qty: parseQty(line.qty),
      lineDiscount: paisa(line.lineDiscount),
      modifiers: modifiersByLine.get(line.id) ?? [],
    }));
    const subtotal = maySeeMoney ? linesSubtotal(priceLines(domainLines)) : (0n as Paisa);
    const serviceStartedAt = order.serviceStartedAt;
    const paymentBreakdowns =
      maySeeMoney && domainLines.length > 0 && serviceStartedAt !== null
        ? (['CARD', 'CASH'] as const).map((method) => {
            const totals = computeTotals({
              lines: domainLines,
              orderType: order.type,
              deliveryCharge: paisa(order.deliveryCharge),
              orderDiscount: paisa(order.orderDiscount),
              payments: [{ method, amount: paisa(0n) }],
              serviceStartedAt,
              rules: taxRules,
              policy: withServiceChargeOverride(
                taxPolicy,
                order.serviceChargeBpsOverride,
                order.type,
              ),
            });
            return {
              method,
              discountTotal: totals.discountTotal,
              taxableBase: totals.taxableBase,
              taxTotal: totals.taxTotal,
              taxRatesBps: [...new Set(totals.taxLines.map((line) => line.rateBps))],
              deliveryCharge: totals.deliveryCharge ?? paisa(0n),
              serviceCharge: totals.serviceCharge,
              posFee: totals.posFee,
              roundingAdj: totals.roundingAdj,
              grandTotal: totals.grandTotal,
            };
          })
        : [];

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      channel: order.channel,
      type: order.type,
      status: currentOrderStatus(order.status as PersistedOrderStatus),
      tableCode: table?.code ?? null,
      zoneName: table === null ? null : (zoneNameById.get(table.zoneId) ?? null),
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      deliveryAddress: order.type === 'DELIVERY' ? order.deliveryAddress : null,
      guestCount: order.guestCount,
      waiterInitials: waiterName === null ? null : initialsOf(waiterName),
      itemCount: activeLines.length,
      lineSummary: activeLines.map((line) => `${parseQty(line.qty) / 1000n}× ${line.nameSnapshot}`),
      elapsedSeconds: elapsedSeconds(order.createdAt),
      subtotalExTax: subtotal,
      paymentBreakdowns,
    };
  });
}

/**
 * `listTrayOrders` plus the same zone-name reduction the `/orders` page and
 * the order screen's own queue modal both need — one source, so a tray order
 * and its zone filter never drift apart (extracted for `OrdersQueueDialog`,
 * `docs/decisions/0014-…`).
 */
export async function loadOrdersQueue(
  viewer: Viewer,
): Promise<{ readonly orders: readonly TrayOrder[]; readonly zones: readonly string[] }> {
  const [trayOrders, allZones] = await Promise.all([listTrayOrders(viewer), listZones()]);
  const activeZones = [
    ...new Set(
      allZones
        .map((zone) => zone.name)
        .filter((name) => trayOrders.some((order) => order.zoneName === name)),
    ),
  ];
  return { orders: trayOrders, zones: activeZones };
}

export interface ExistingOrderSummary {
  readonly orderId: string;
  readonly orderNo: number;
  readonly tableId: string | null;
  readonly guestCount: number | null;
  readonly itemCount: number;
  readonly subtotalExTax: Paisa;
}

/**
 * "Load order"/"Open order" (§9.3, §11.3) — the one open order already
 * attached to a table, if any. `OrderScreen` shows this read-only above the
 * live cart and reuses its id as `existingOrderId` on the next send
 * (docs/runfiles/M09b-floor-live.md §3 — a second round, not a
 * reconstructed cart). Two entry points share one lookup: the floor plan
 * knows a `tableId` (`findOpenOrderForTable`), the tray already knows the
 * `orderId` directly (`findOrderSummary`) — `TrayOrder`'s frozen shape has
 * no `tableId` for it to navigate by instead.
 */
export async function findOpenOrderForTable(tableId: string): Promise<ExistingOrderSummary | null> {
  const db = dbRead();

  const orderRows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.tableId, tableId), workableOrder()))
    .orderBy(orders.createdAt);

  // The most recently opened open order — see M09a §4: a table already past
  // `SERVED` cannot reopen its old order, so a second, newer order can exist
  // on the same table while the first is still technically "open".
  const last = orderRows[orderRows.length - 1];
  return last === undefined ? null : findOrderSummary(last.id);
}

export async function findOrderSummary(orderId: string): Promise<ExistingOrderSummary | null> {
  const db = dbRead();

  const orderRows = await db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      tableId: orders.tableId,
      guestCount: orders.guestCount,
    })
    .from(orders)
    .where(
      // `workableOrder()` carries both halves of what this id may still mean:
      // not already closed, and not a web order still waiting to be accepted.
      // Its own doc comment records that this call site was once the one
      // caller missing the first half.
      and(eq(orders.id, orderId), workableOrder()),
    );

  const order = orderRows[0];
  if (order === undefined) return null;

  const [lineRows, modifierRows, taxClassRows] = await Promise.all([
    db
      .select({
        id: orderLines.id,
        nameSnapshot: orderLines.nameSnapshot,
        qty: orderLines.qty,
        unitPrice: orderLines.unitPrice,
        lineDiscount: orderLines.lineDiscount,
        taxClassId: orderLines.taxClassId,
        voidReason: orderLines.voidReason,
      })
      .from(orderLines)
      .where(and(eq(orderLines.orderId, order.id), isNull(orderLines.deletedAt))),
    db
      .select({
        orderLineId: orderLineModifiers.orderLineId,
        priceDelta: orderLineModifiers.priceDelta,
      })
      .from(orderLineModifiers)
      .innerJoin(orderLines, eq(orderLines.id, orderLineModifiers.orderLineId))
      .where(
        and(
          eq(orderLines.orderId, order.id),
          isNull(orderLines.deletedAt),
          isNull(orderLineModifiers.deletedAt),
        ),
      ),
    db.select({ id: taxClasses.id, key: taxClasses.key }).from(taxClasses),
  ]);

  const taxKeyById = new Map(taxClassRows.map((row) => [row.id, row.key as TaxClassKey]));
  const modifiersByLine = new Map<string, { name: string; priceDelta: Paisa }[]>();
  for (const row of modifierRows) {
    const bucket = modifiersByLine.get(row.orderLineId) ?? [];
    bucket.push({ name: '', priceDelta: paisa(row.priceDelta) });
    modifiersByLine.set(row.orderLineId, bucket);
  }

  const activeLines = lineRows.filter((line) => line.voidReason === null);
  const subtotal = linesSubtotal(
    priceLines(
      activeLines.map((line) => ({
        id: line.id,
        name: line.nameSnapshot,
        taxClass: taxKeyById.get(line.taxClassId ?? '') ?? DEFAULT_TAX_CLASS_KEY,
        unitPrice: paisa(line.unitPrice),
        qty: parseQty(line.qty),
        lineDiscount: paisa(line.lineDiscount),
        modifiers: modifiersByLine.get(line.id) ?? [],
      })),
    ),
  );

  return {
    orderId: order.id,
    orderNo: order.orderNo,
    tableId: order.tableId,
    guestCount: order.guestCount,
    itemCount: activeLines.length,
    subtotalExTax: subtotal,
  };
}
