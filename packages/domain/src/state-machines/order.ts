import { defineMachine } from './machine';

/** §5.6 `orders.status`. */
export type OrderStatus = 'DRAFT' | 'PLACED' | 'SERVED' | 'FINALIZED' | 'VOIDED';

/**
 * The order lifecycle — BUILD-PLAN.md §5.6, §6.2.
 *
 * FINALIZED is terminal. That is R5 expressed as a state machine: once an
 * invoice has a gap-free `local_no` and has been transmitted, the way back is a
 * credit note plus a fresh invoice, never an edit. A transition out of
 * FINALIZED would be a second fiscal document for one sale.
 *
 * ADR 0018 — removed IN_KITCHEN and READY: the kitchen display product this
 * product depended on for both states is gone, so every order now goes
 * PLACED straight to SERVED, the same edge a takeaway with nothing to cook
 * already used.
 *
 * ADR 0019 — removed CHECK_PRINTED: there is no more pre-payment bill. SERVED
 * goes straight to FINALIZED; the invoice at finalize is the first and only
 * printed document.
 */
export const orderMachine = defineMachine<OrderStatus>('order', {
  DRAFT: ['PLACED', 'VOIDED'],
  PLACED: ['SERVED', 'VOIDED'],
  SERVED: ['FINALIZED', 'VOIDED'],
  FINALIZED: [],
  VOIDED: [],
});
