import { parseQty, type Qty } from '@natech/domain';

/**
 * Turning a filled-in checklist into sheet lines — M24,
 * docs/runfiles/M24-demand-catalogue.md §3.
 *
 * Pure, and separate from `queries.ts` for the same reason `total.ts` is: that
 * module is `server-only`, and this is the branchy part worth testing without a
 * database.
 *
 * The grid posts a box for all 144 catalogue items. Only the ones the manager
 * actually wrote in become lines — an empty box means "not this week", which is
 * a different statement from asking for none, and a submitted sheet listing 144
 * rows of zero would bury the twenty that matter.
 */

export interface GridEntry {
  readonly itemId: string;
  readonly name: string;
  readonly category: string;
  readonly defaultUnit: string | null;
  /** Exactly what was typed in the box, untrimmed. */
  readonly raw: string;
}

export interface GridLine {
  readonly item: string;
  readonly category: string;
  readonly unit: string | null;
  readonly qty: Qty;
}

export interface GridResult {
  readonly lines: readonly GridLine[];
  /** One readable message per bad box, naming the item. */
  readonly errors: readonly string[];
}

export function collectGridLines(entries: readonly GridEntry[]): GridResult {
  const lines: GridLine[] = [];
  const errors: string[] = [];

  for (const entry of entries) {
    const text = entry.raw.trim();
    if (text === '') continue;

    let qty: Qty;
    try {
      qty = parseQty(text);
    } catch {
      // Named, not indexed. "Row 87 is invalid" is useless on a 144-row grid
      // the manager has just scrolled through.
      errors.push(`${entry.name}: "${text}" is not a quantity.`);
      continue;
    }
    // Zero is a legitimate thing to type and means the same as leaving it
    // blank. Negative is not, and is far more likely a typo than an intention.
    if (qty === 0n) continue;
    if (qty < 0n) {
      errors.push(`${entry.name}: a quantity cannot be negative.`);
      continue;
    }
    lines.push({
      item: entry.name,
      category: entry.category,
      unit: entry.defaultUnit,
      qty,
    });
  }

  return { lines, errors };
}
