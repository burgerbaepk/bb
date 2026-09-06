import type { TaxClassKey } from '@natech/contracts';

/**
 * Pure logic behind the menu screens — BUILD-PLAN.md §5.3; M08 runfile.
 *
 * Nothing here touches `dbRead`/`dbWrite`, a session, or React, on purpose:
 * `actions.ts` and `queries.ts` call into this, and a test can assert the
 * decision itself without standing up a database or a signed-in operator —
 * the "logic-level" tests the M08 slice asks for.
 */

/**
 * The M08 decision "Drag-reorder writes a full re-sequence": turn whatever
 * order a drag left the client in into contiguous integers starting at zero,
 * in that order. The database gets ordinals, never gaps, regardless of what
 * `sort_order` held before the drag — a fractional-index scheme is the usual
 * alternative and is deliberately not this one; see the runfile.
 */
export function resequence(
  orderedIds: readonly string[],
): ReadonlyArray<{ readonly id: string; readonly sortOrder: number }> {
  return orderedIds.map((id, index) => ({ id, sortOrder: index }));
}

/**
 * A stale client's dropped order is trusted as an *order*; its *membership*
 * is not — the same asymmetry the runfile has `FloorEditor`'s save
 * re-validate geometry against a zone's grid bounds, applied here to a list
 * instead of a grid. A reorder call whose ids don't match what the database
 * currently holds for that scope is refused rather than silently adding a row
 * that was never in the list or dropping one that still is.
 */
export function isSamePopulation(current: readonly string[], proposed: readonly string[]): boolean {
  if (current.length !== proposed.length) return false;
  const currentSet = new Set(current);
  return proposed.every((id) => currentSet.has(id));
}

/**
 * §5.3 — `taxClass` arrives off the wire as the enum key; `menu_items.tax_class_id`
 * wants the seeded row's id. Split out from the query that fetches the seeded
 * rows so the "the key isn't seeded" branch is a plain lookup a test can
 * assert on without a database — `packages/db/seeds/tax.ts` seeds exactly
 * three rows, so fetching all of them and searching in memory costs nothing,
 * unlike the single-row `where(eq(key, ...))` lookup `createStaffAction` uses
 * for a role key, which this mirrors in spirit rather than literally.
 */
export function findTaxClassId(
  rows: readonly { readonly key: string; readonly id: string }[],
  key: TaxClassKey,
): string | null {
  return rows.find((row) => row.key === key)?.id ?? null;
}

/**
 * §10.1, defect V5's own rule for a modifier group: `minSelect`, `maxSelect`,
 * and `isRequired` only make sense as a set. Checked here so it can run
 * server-side (§14.1: client-side hiding is cosmetic) and not only in the
 * form that already disables its own submit button on the same condition.
 */
export function validateSelectRange(input: {
  readonly minSelect: number;
  readonly maxSelect: number;
  readonly isRequired: boolean;
}): string | null {
  if (input.minSelect > input.maxSelect) {
    return 'The minimum cannot be greater than the maximum.';
  }
  if (input.isRequired && input.minSelect < 1) {
    return 'A required group needs a minimum of at least one, otherwise the cashier can skip it.';
  }
  return null;
}
