import { extend, sum, type Paisa, type Qty } from '@natech/domain';

/**
 * Demand sheet arithmetic — ADR 0026, docs/runfiles/M23-demand-sheets.md.
 *
 * Kept out of `queries.ts` because that module is `server-only` and this is
 * pure: the same split `lib/floor/bounds.ts` and `lib/dashboard/trend.ts` use,
 * so the arithmetic can be tested without a database.
 */

export interface DemandLineRow {
  readonly id: string;
  readonly item: string;
  /** Nullable since M24 — the printed sheet has no unit column. */
  readonly unit: string | null;
  /** The catalogue category, snapshotted. Null on an off-list line. */
  readonly category: string | null;
  readonly qty: Qty;
  /** Null where the manager did not know the price. Not zero — see `sheetEstimate`. */
  readonly estimatedUnitCost: Paisa | null;
  readonly note: string | null;
}

/**
 * What the sheet is expected to cost.
 *
 * R1 throughout: `extend()` multiplies a unit cost across a `Qty` and rounds
 * half away from zero once per line, so a fractional quantity cannot
 * accumulate error across a forty-line sheet.
 *
 * A line with no estimated cost contributes nothing and is **counted
 * separately** by `unpricedLines` rather than treated as free. R16 — a summary
 * has to be a function of the rows it claims to summarise, and "Rs. 48,200"
 * over a sheet where nine lines had no price is a number that reads as a total
 * and is not one.
 */
export function sheetEstimate(lines: readonly DemandLineRow[]): Paisa {
  return sum(
    lines
      .filter(
        (line): line is DemandLineRow & { estimatedUnitCost: Paisa } =>
          line.estimatedUnitCost !== null,
      )
      .map((line) => extend(line.estimatedUnitCost, line.qty)),
  );
}

/** How many lines the estimate could not account for. */
export function unpricedLines(lines: readonly DemandLineRow[]): number {
  return lines.filter((line) => line.estimatedUnitCost === null).length;
}
