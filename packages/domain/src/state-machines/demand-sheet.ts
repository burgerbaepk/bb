import { defineMachine } from './machine';

/** `demand_sheets.status` — ADR 0026. */
export type DemandSheetStatus = 'DRAFT' | 'SUBMITTED' | 'CANCELLED';

/**
 * A demand sheet's lifecycle — ADR 0026; docs/runfiles/M23-demand-sheets.md §3.
 *
 * Two edges out of DRAFT and one out of SUBMITTED. The shape is the one R5
 * gives the invoice and `shiftMachine` gives the till: once a document has been
 * handed to somebody it is never edited, only cancelled and rewritten. A
 * manager who submits a sheet for the wrong Tuesday cancels it and writes
 * another, so the record shows both the mistake and the correction rather than
 * a sheet that quietly became a different sheet.
 *
 * There is no RECEIVED state, and adding one is not a small change — see
 * ADR 0026, "What this specifically does not build".
 */
export const demandSheetMachine = defineMachine<DemandSheetStatus>('demand sheet', {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['CANCELLED'],
  CANCELLED: [],
});
