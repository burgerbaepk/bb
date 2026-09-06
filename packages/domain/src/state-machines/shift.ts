import { defineMachine } from './machine';

/** §5.9 `shifts.status`. */
export type ShiftStatus = 'OPEN' | 'CLOSED';

/**
 * The till's cash lifecycle — BUILD-PLAN.md §5.9, §6.13, §12;
 * docs/runfiles/M12-shifts.md §3.
 *
 * One edge, and CLOSED is terminal: the way back into a miscounted shift is a
 * cash movement recorded against a fresh one, never reopening a closed till —
 * the same "no edit, only a fresh document" shape R5 already gives the
 * invoice lifecycle.
 */
export const shiftMachine = defineMachine<ShiftStatus>('shift', {
  OPEN: ['CLOSED'],
  CLOSED: [],
});
