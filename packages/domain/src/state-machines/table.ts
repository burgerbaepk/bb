import { defineMachine } from './machine';

/** §9.1 `tables.status`. */
export type TableStatus =
  'FREE' | 'RESERVED' | 'SEATED' | 'ORDERED' | 'SERVED' | 'PAYING' | 'CLEANING' | 'BLOCKED';

/**
 * The floor lifecycle — BUILD-PLAN.md §9.1.
 *
 * Every one of these is rendered with an icon and a text label as well as a
 * colour (R15), and every transition writes an audit row (R7).
 *
 * ADR 0019 — removed CHECK_PRINTED: there is no more pre-payment bill, so a
 * table goes straight from SERVED to PAYING, and PAYING returns to SERVED
 * (not a printed check) when a payment sheet is closed without settling,
 * which is what happens when a card declines.
 *
 * BLOCKED is reachable from everywhere and leads only to FREE: taking a table
 * out of service is always allowed, and putting it back always goes through a
 * clean.
 */
export const tableMachine = defineMachine<TableStatus>('table', {
  FREE: ['RESERVED', 'SEATED', 'BLOCKED'],
  // A reservation that never arrives times out back to FREE.
  RESERVED: ['SEATED', 'FREE', 'BLOCKED'],
  SEATED: ['ORDERED', 'CLEANING', 'FREE', 'BLOCKED'],
  ORDERED: ['SERVED', 'PAYING', 'CLEANING', 'BLOCKED'],
  // Back to ORDERED when the table orders a second course.
  SERVED: ['ORDERED', 'PAYING', 'CLEANING', 'BLOCKED'],
  PAYING: ['CLEANING', 'SERVED', 'BLOCKED'],
  CLEANING: ['FREE', 'BLOCKED'],
  BLOCKED: ['FREE'],
});
