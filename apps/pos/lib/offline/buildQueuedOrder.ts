import { ENGINE_VERSION, whole, type Paisa } from '@natech/domain';
import { toPaisaWire, toQtyWire } from '@natech/contracts';
import type { OrderType, PaymentSliceDraft, QueuedLine, QueuedOrder } from '@natech/contracts';
import { lineLabel, unitPriceOf, type CartLine } from '@/components/order/cartModel';

/**
 * Build the frozen `QueuedOrder` wire shape from the till's own state —
 * BUILD-PLAN.md §8; docs/runfiles/M16-offline.md §2/§3.
 *
 * §8's own wire contract (`packages/contracts/src/sync.ts`) bundles a whole
 * sale — lines, payments — into one object rather than separate queued
 * steps, which is why this is the only thing `OrderScreen` queues offline:
 * there is no separate "place order" event to build, because no server is
 * reachable without the same network that is down (this runfile's §2 Out).
 *
 * Pure — takes exactly the values `OrderScreen` already holds in state, so it
 * is testable without a browser, unlike `lib/offline/db.ts`.
 */
export interface BuildQueuedOrderInput {
  readonly clientOrderUuid: string;
  readonly terminalId: string;
  readonly orderNo: number;
  readonly type: OrderType;
  readonly tableId: string | null;
  readonly guestCount: number | null;
  readonly serviceStartedAt: Date;
  readonly openedAt: Date;
  readonly orderDiscount: Paisa;
  readonly deliveryAddress?: string | null;
  readonly deliveryCharge?: Paisa;
  readonly serviceChargeBpsOverride?: number | null;
  readonly lines: readonly CartLine[];
  readonly payments: readonly PaymentSliceDraft[];
  /** What the terminal itself computed — §8: the server compares and reports drift. */
  readonly clientGrandTotal: Paisa | null;
  readonly clientTaxTotal: Paisa | null;
}

function toQueuedLine(line: CartLine): QueuedLine {
  return {
    clientLineUuid: crypto.randomUUID(),
    menuItemId: line.item.id,
    variantId: line.variant?.id ?? null,
    nameSnapshot: lineLabel(line),
    nameUrSnapshot: line.item.nameUr,
    qty: toQtyWire(whole(line.qty)),
    unitPrice: toPaisaWire(unitPriceOf(line.item, line.variant)),
    // No per-line discount exists in the cart model (§5.6's schema has none
    // besides an order-level one) — the same zero `placeOrderAction`'s own
    // live cart preview (`OrderScreen`'s `order` memo) already snapshots.
    lineDiscount: toPaisaWire(0n as Paisa),
    taxClass: line.item.taxClass,
    seatNo: line.seatNo,
    note: line.note,
    modifiers: line.modifiers.map((modifier) => ({
      modifierId: modifier.id,
      nameSnapshot: modifier.name,
      nameUrSnapshot: modifier.nameUr,
      priceDelta: toPaisaWire(modifier.priceDelta),
    })),
  };
}

export function buildQueuedOrder(input: BuildQueuedOrderInput): QueuedOrder {
  return {
    clientOrderUuid: input.clientOrderUuid,
    terminalId: input.terminalId,
    orderNo: input.orderNo,
    type: input.type,
    tableId: input.tableId,
    guestCount: input.guestCount,
    // No waiter-assignment UI exists on the cart today — `placeOrderAction`'s
    // own input carries none either.
    waiterId: null,
    note: null,
    serviceStartedAt: input.serviceStartedAt.toISOString(),
    openedAt: input.openedAt.toISOString(),
    orderDiscount: toPaisaWire(input.orderDiscount),
    deliveryAddress: input.type === 'DELIVERY' ? (input.deliveryAddress ?? null) : null,
    deliveryCharge: toPaisaWire(
      (input.type === 'DELIVERY' ? (input.deliveryCharge ?? 0n) : 0n) as Paisa,
    ),
    serviceChargeBpsOverride: input.serviceChargeBpsOverride ?? null,
    lines: input.lines.map(toQueuedLine),
    payments: input.payments.map((slice) => ({
      method: slice.method,
      amount: toPaisaWire(slice.amount),
      tendered: null,
      change: null,
      cardLast4: null,
      attemptStatus: slice.attemptStatus,
      declinedReason: slice.declinedReason,
      at: new Date().toISOString(),
    })),
    clientGrandTotal: input.clientGrandTotal === null ? null : toPaisaWire(input.clientGrandTotal),
    clientTaxTotal: input.clientTaxTotal === null ? null : toPaisaWire(input.clientTaxTotal),
    clientEngineVersion: ENGINE_VERSION,
  };
}
