/**
 * When the web-order alarm rings, and what silences it — BUILD-PLAN.md §13.4.
 *
 * §13.4's flow line reads "Redis publish → POS tray badge and audible chime".
 * The product owner's requirement is stronger than a chime: the alert repeats
 * until somebody deals with it, because the failure it exists to prevent is a
 * QR order sitting unnoticed on a screen nobody is looking at while the
 * customer waits at a table.
 *
 * "Until somebody deals with it" is the whole difficulty, and it is why this
 * is a pure function with a test rather than a condition inlined in an effect.
 * Two ways to get it wrong, both bad in service:
 *
 *   A flag that says "silenced" mutes every *future* order too, so the second
 *   QR order of the night arrives in silence and the alert is worse than
 *   useless — staff have learnt to trust it.
 *
 *   A flag that resets whenever the pending list changes rings again every
 *   time an unrelated order is accepted, so staff silence it permanently at
 *   the browser and the alert is, again, worse than useless.
 *
 * So acknowledgement is per order, never global: silencing acknowledges
 * exactly the orders on screen at that moment, and an order that was not on
 * screen then still rings when it lands. Accepting or rejecting removes the
 * order from `pending` entirely, which is the other way the noise stops — the
 * one §13.4 actually wants.
 */
export interface AlertableOrder {
  readonly orderId: string;
}

/** The pending orders nobody has silenced or decided about yet. Non-empty means ring. */
export function alertingOrders<T extends AlertableOrder>(
  pending: readonly T[],
  acknowledged: readonly string[],
): readonly T[] {
  const silenced = new Set(acknowledged);
  return pending.filter((order) => !silenced.has(order.orderId));
}

/**
 * Drop acknowledgements for orders that are no longer pending.
 *
 * Two reasons, and the second is the one that bites. The list would otherwise
 * grow for the length of a shift on a terminal that is never reloaded; and an
 * order number is not what is tracked here, an order id is, so a stale id can
 * never collide — but keeping ids for decided orders means the set no longer
 * describes "what is on screen", which is the only thing the silence button
 * claims to have silenced.
 */
export function pruneAcknowledged(
  pending: readonly AlertableOrder[],
  acknowledged: readonly string[],
): readonly string[] {
  const live = new Set(pending.map((order) => order.orderId));
  return acknowledged.filter((orderId) => live.has(orderId));
}
