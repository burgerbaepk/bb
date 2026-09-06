import type { TrayOrder } from '../src/orders';
import { paisa } from '@natech/domain';
import { MOCK_ORDERS, orderElapsedSeconds, orderSubtotal, trayLineSummary } from './orders';

/**
 * The tray projection — BUILD-PLAN.md §11.3, R16.
 *
 * Deriving rather than storing is the point: the header count and the header
 * sum in `ActiveOrdersTray` are computed from these same rows, so the two
 * cannot disagree (defects C3, V1).
 *
 * ADR 0019 — there is no more pre-payment check, so the card always shows
 * `Subtotal (ex tax)`, with `TAKE PAYMENT` once the order reaches `SERVED`.
 */
export function trayOrders(): readonly TrayOrder[] {
  return MOCK_ORDERS.filter(
    (order) => order.status !== 'FINALIZED' && order.status !== 'VOIDED',
  ).map((order) => ({
    orderId: order.id,
    orderNo: order.orderNo,
    channel: order.channel,
    type: order.type,
    status: order.status,
    tableCode: order.tableCode,
    zoneName: order.zoneName,
    customerName: order.customerName,
    guestCount: order.guestCount,
    waiterInitials: order.waiterInitials,
    itemCount: order.lines.length,
    lineSummary: trayLineSummary(order),
    elapsedSeconds: orderElapsedSeconds(order),
    subtotalExTax: orderSubtotal(order),
    paymentBreakdowns: (['CARD', 'CASH'] as const).map((method) => {
      const subtotal = orderSubtotal(order);
      const rateBps = method === 'CARD' ? 800 : 1600;
      const taxTotal = (subtotal * BigInt(rateBps)) / 10_000n;
      return {
        method,
        discountTotal: paisa(0n),
        taxableBase: subtotal,
        taxTotal: paisa(taxTotal),
        taxRatesBps: [rateBps],
        serviceCharge: paisa(0n),
        posFee: paisa(100n),
        roundingAdj: paisa(0n),
        grandTotal: paisa(subtotal + taxTotal + 100n),
      };
    }),
  }));
}

export const MOCK_TRAY_ORDERS: readonly TrayOrder[] = trayOrders();
