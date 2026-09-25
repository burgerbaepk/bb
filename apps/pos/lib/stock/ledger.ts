import { parseQty, qty, qtyToString, type Qty } from '@natech/domain';

/**
 * The stock ledger's rules — ADR 0034, docs/runfiles/M28-stock-ledger.md.
 *
 * Pure, and apart from the `server-only` modules for the same reason as
 * `lib/demand/grid.ts`. Both actions ask these functions, under lock, with the
 * book they read inside their transaction.
 */

export type StockKind = 'RECEIVED' | 'ISSUED' | 'WASTED' | 'COUNTED';

export const KIND_LABEL: Record<StockKind, string> = {
  RECEIVED: 'Received',
  ISSUED: 'Issued to kitchen',
  WASTED: 'Wasted',
  COUNTED: 'Counted',
};

/** `20.000` → `20`, `0.250` → `0.25`. For display; persistence uses `qtyToString`. */
export function showQty(value: Qty): string {
  return qtyToString(value).replace(/\.?0+$/, '');
}

export function onHand(deltas: readonly Qty[]): Qty {
  return qty(deltas.reduce<bigint>((running, delta) => running + delta, 0n));
}

/**
 * The change a movement makes to the book. The database `CHECK` holds the same
 * signs, so a mistake here fails the insert rather than corrupting the book.
 */
export function movementDelta(kind: StockKind, quantity: Qty, book: Qty): Qty {
  switch (kind) {
    case 'RECEIVED':
      return quantity;
    case 'ISSUED':
    case 'WASTED':
      return qty(-quantity);
    case 'COUNTED':
      // The variance: negative is shrinkage, positive is an unrecorded receipt.
      return qty(quantity - book);
  }
}

export interface MovementRequest {
  readonly name: string;
  readonly kind: StockKind;
  readonly quantity: Qty;
  readonly book: Qty;
  /** The unit the item will have after this movement — saved, or given now. */
  readonly unit: string | null;
  readonly note: string | null;
  readonly occurredOn: string;
  readonly today: string;
}

/** Null when the movement may be written; otherwise the sentence to show, naming the item. */
export function refuseMovement(m: MovementRequest): string | null {
  // "12" chickens and "12" kilos are different stock. ADR 0034: no unit was
  // seeded, so the first movement is where somebody who knows says which.
  if (m.unit === null) return `${m.name}: give the unit first — kg, litre, piece.`;
  if (m.occurredOn > m.today) return `${m.name}: a movement cannot be dated in the future.`;

  if (m.kind === 'COUNTED') {
    if (m.quantity < 0n) return `${m.name}: a count cannot be negative.`;
    // A count is of the shelf now. Back-dated, its variance would be measured
    // against a book that already holds later movements.
    if (m.occurredOn !== m.today) return `${m.name}: a count must be dated today.`;
    return null;
  }

  if (m.quantity <= 0n) return `${m.name}: enter a quantity greater than zero.`;
  if (m.kind === 'WASTED' && m.note === null) return `${m.name}: say why it was wasted.`;
  // ADR 0034 — no negative stock. If the book says 4 and the kitchen took 5,
  // one of the two is wrong, and the fix is a count, not a negative.
  if ((m.kind === 'ISSUED' || m.kind === 'WASTED') && m.quantity > m.book)
    return `${m.name}: the book shows ${showQty(m.book)} ${m.unit}. Record the delivery, or count it first.`;
  return null;
}

/** One item's boxes on the count sheet, exactly as posted. */
export interface CountEntry {
  readonly itemId: string;
  readonly name: string;
  /** The catalogue's unit, if it has one. */
  readonly savedUnit: string | null;
  readonly rawQty: string;
  /** The unit box, shown only for an item with no saved unit. */
  readonly rawUnit: string;
}

export interface CountLine {
  readonly itemId: string;
  readonly name: string;
  readonly quantity: Qty;
  readonly unit: string | null;
  /** Set when this count is what gives the item its unit. */
  readonly newUnit: string | null;
}

/**
 * Turn the count sheet into counts.
 *
 * Not `collectGridLines`, deliberately (ADR 0034): on a demand sheet a typed
 * zero means the same as blank — "not this week". On a count they are
 * different statements. Blank is "not counted"; 0 is "counted, and the shelf
 * is empty", which is exactly the line a shrinkage check needs.
 */
export function collectCounts(entries: readonly CountEntry[]): {
  readonly lines: readonly CountLine[];
  readonly errors: readonly string[];
} {
  const lines: CountLine[] = [];
  const errors: string[] = [];
  for (const entry of entries) {
    const text = entry.rawQty.trim();
    if (text === '') continue;
    let quantity: Qty;
    try {
      quantity = parseQty(text);
    } catch {
      errors.push(`${entry.name}: "${text}" is not a quantity.`);
      continue;
    }
    const given = entry.rawUnit.trim().slice(0, 32);
    const newUnit = entry.savedUnit === null && given !== '' ? given : null;
    lines.push({
      itemId: entry.itemId,
      name: entry.name,
      quantity,
      unit: entry.savedUnit ?? newUnit,
      newUnit,
    });
  }
  return { lines, errors };
}
