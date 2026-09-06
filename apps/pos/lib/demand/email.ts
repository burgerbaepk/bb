import { formatPaisa } from '@natech/ui';
import { formatQty } from '@/components/lib/format';
import { sheetEstimate, unpricedLines, type DemandLineRow } from './total';

/**
 * The demand sheet as an owner reads it in their inbox — ADR 0026,
 * docs/runfiles/M23-demand-sheets.md.
 *
 * Pure, and kept out of `actions.ts` for two reasons: that module is
 * `'use server'`, where every export must be an async server action, and the
 * body is the part worth asserting against without a database — the same split
 * `total.ts` already makes.
 *
 * A demand sheet is a record of **what a manager asked for**, never a fact
 * about the restaurant (the ADR's boundary). The wording here keeps that
 * straight: "requested", never "ordered", and the estimate is labelled an
 * estimate with the unpriced lines counted beside it rather than folded in as
 * though they were free (R16).
 */
export interface DemandSheetEmailInput {
  readonly neededBy: string;
  readonly supplier: string | null;
  readonly note: string | null;
  readonly createdBy: string | null;
  readonly submittedAt: Date | null;
  readonly lines: readonly DemandLineRow[];
}

function rs(value: bigint): string {
  return formatPaisa(value, { symbol: 'Rs.' });
}

function lineText(line: DemandLineRow): string {
  const qty = line.unit === null ? formatQty(line.qty) : `${formatQty(line.qty)} ${line.unit}`;
  const parts = [`  ${line.item} — ${qty}`];
  if (line.category !== null) parts.push(`(${line.category})`);
  if (line.estimatedUnitCost !== null) parts.push(`est. ${rs(line.estimatedUnitCost)}/unit`);
  if (line.note !== null && line.note !== '') parts.push(`— ${line.note}`);
  return parts.join(' ');
}

export function demandSheetEmail(sheet: DemandSheetEmailInput): {
  readonly subject: string;
  readonly text: string;
} {
  const unpriced = unpricedLines(sheet.lines);
  const text = [
    `Demand sheet submitted — needed by ${sheet.neededBy}`,
    `Submitted by ${sheet.createdBy ?? 'Unknown'} at ${sheet.submittedAt?.toISOString() ?? '—'}`,
    `Supplier: ${sheet.supplier ?? 'not named'}`,
    ...(sheet.note === null ? [] : [`Note: ${sheet.note}`]),
    '',
    `Requested (${sheet.lines.length} ${sheet.lines.length === 1 ? 'line' : 'lines'}):`,
    ...sheet.lines.map(lineText),
    '',
    `Estimated cost: ${rs(sheetEstimate(sheet.lines))}` +
      (unpriced === 0
        ? ''
        : ` — excludes ${unpriced} ${unpriced === 1 ? 'line' : 'lines'} with no estimated price`),
    '',
    'This sheet is now frozen and cannot be edited.',
  ].join('\n');

  return { subject: `Demand sheet — needed by ${sheet.neededBy}`, text };
}
