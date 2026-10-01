import { isNull } from 'drizzle-orm';
import { expenses, type Tx } from '@natech/db';

/**
 * M32 — one category, one spelling. Categories are free text (no table: a
 * category is only ever a label on an expense), so the form's dropdown alone
 * cannot stop "Utilities", "utilities" and "Utilities " becoming three rows in
 * every report that groups by it. Every write passes through here instead: a
 * typed category that matches an existing one, ignoring case and spacing,
 * takes the existing spelling.
 */
const normalise = (text: string): string => text.trim().replace(/\s+/g, ' ');

export function matchCategory(existing: readonly string[], typed: string): string {
  const clean = normalise(typed);
  const key = clean.toLowerCase();
  return existing.find((category) => normalise(category).toLowerCase() === key) ?? clean;
}

// ponytail: reads every distinct category per write — a restaurant has tens,
// not thousands. Move to a `lower(category)` lookup if that ever changes.
export async function resolveCategory(tx: Tx, typed: string): Promise<string> {
  const rows = await tx
    .selectDistinct({ category: expenses.category })
    .from(expenses)
    .where(isNull(expenses.deletedAt));
  return matchCategory(
    rows.map((row) => row.category),
    typed,
  );
}
