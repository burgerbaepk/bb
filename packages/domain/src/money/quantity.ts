import { divideHalfUp, paisa, type Paisa } from './paisa';

/**
 * Quantity — BUILD-PLAN.md §5.6.
 *
 * `order_lines.qty` is `numeric(10,3)`, so a quantity carries three decimal
 * places: four tikka, or 0.5 kg of something sold by weight. Held here as an
 * integer count of thousandths for the same reason money is held as paisa —
 * 0.1 is not representable in binary floating point, and a 999-quantity line at
 * a fractional weight would drift.
 */

declare const qtyBrand: unique symbol;

/** An integer count of thousandths. `4` is `4000n`; `0.5` is `500n`. */
export type Qty = bigint & { readonly [qtyBrand]: 'Qty' };

const QTY_SCALE = 1000n;

export function qty(thousandths: bigint): Qty {
  return thousandths as Qty;
}

/** A whole-number quantity, the common case. */
export function whole(count: number): Qty {
  if (!Number.isInteger(count)) {
    throw new TypeError(`whole() takes an integer, got ${count}. Use parseQty for a fraction.`);
  }
  return qty(BigInt(count) * QTY_SCALE);
}

export const ONE: Qty = whole(1);

/**
 * Parse a decimal string such as `"4"`, `"0.5"`, or `"1.250"`.
 *
 * Not `parseFloat`, for the same reason `parsePaisa` is not.
 */
export function parseQty(text: string): Qty {
  const match = /^(-)?(\d+)(?:\.(\d{1,3}))?$/.exec(text.trim());
  if (match === null) {
    throw new TypeError(`not a quantity: ${JSON.stringify(text)}`);
  }
  const sign = match[1];
  // Group 2 is `(\d+)` and cannot be absent once the pattern has matched.
  const units = match[2] as string;
  const magnitude = BigInt(units) * QTY_SCALE + BigInt((match[3] ?? '').padEnd(3, '0'));
  return qty(sign === '-' ? -magnitude : magnitude);
}

/** For persistence into `numeric(10,3)`, which Drizzle round-trips as a string. */
export function qtyToString(value: Qty): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const units = magnitude / QTY_SCALE;
  const fraction = (magnitude % QTY_SCALE).toString().padStart(3, '0');
  return `${negative ? '-' : ''}${units}.${fraction}`;
}

/**
 * Extend a unit price across a quantity, rounding half away from zero.
 *
 * A whole quantity is exact: 4 × Rs. 530.00 is 4000 × 53000 ÷ 1000 = 212,000
 * paisa, with no remainder. Rounding only bites on a fractional quantity, and
 * it happens once, here, rather than accumulating across the line.
 */
export function extend(unitPrice: Paisa, quantity: Qty): Paisa {
  return paisa(divideHalfUp(unitPrice * quantity, QTY_SCALE));
}
