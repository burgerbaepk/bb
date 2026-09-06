import type { OrderStatus } from '@natech/contracts';

/** A value that can still be returned while migration 0007 rolls out. */
export type PersistedOrderStatus = OrderStatus | 'CHECK_PRINTED';

/**
 * ADR 0019 removed the pre-payment check. A legacy order that had reached
 * CHECK_PRINTED has already been served, so SERVED is its exact current
 * lifecycle equivalent and remains voidable/finalizable.
 */
export function currentOrderStatus(status: PersistedOrderStatus): OrderStatus {
  return status === 'CHECK_PRINTED' ? 'SERVED' : status;
}
