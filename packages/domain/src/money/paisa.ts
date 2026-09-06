/**
 * Money — BUILD-PLAN.md §2 R1, §6.10, §6.11.
 *
 * All money in this product is an integer count of paisa, held in `bigint`.
 * Floating point cannot represent 0.1, so a tax computation routed through
 * `number` drifts, and PSTSA s.17 makes excess tax collected payable to
 * Government. The drift is small and the consequence is not.
 *
 * `Paisa` is a branded `bigint`: it behaves as a bigint at runtime and refuses
 * to be confused with a plain one at compile time, so a raw `1000n` cannot be
 * passed where a price is expected without saying so.
 */

declare const paisaBrand: unique symbol;

/** An integer count of paisa. 100 paisa is one rupee. */
export type Paisa = bigint & { readonly [paisaBrand]: 'Paisa' };

const BPS_DIVISOR = 10_000n;
const PAISA_PER_RUPEE = 100n;

/** Assert that a bigint is a paisa amount. */
export function paisa(value: bigint): Paisa {
  return value as Paisa;
}

export const ZERO: Paisa = paisa(0n);

export function add(...values: readonly Paisa[]): Paisa {
  let total = 0n;
  for (const value of values) total += value;
  return paisa(total);
}

export function sum(values: Iterable<Paisa>): Paisa {
  let total = 0n;
  for (const value of values) total += value;
  return paisa(total);
}

export function subtract(a: Paisa, b: Paisa): Paisa {
  return paisa(a - b);
}

export function negate(a: Paisa): Paisa {
  return paisa(-a);
}

export function absolute(a: Paisa): Paisa {
  return paisa(a < 0n ? -a : a);
}

export function isNegative(a: Paisa): boolean {
  return a < 0n;
}

export function isZero(a: Paisa): boolean {
  return a === 0n;
}

export function max(a: Paisa, b: Paisa): Paisa {
  return a >= b ? a : b;
}

export function min(a: Paisa, b: Paisa): Paisa {
  return a <= b ? a : b;
}

/**
 * Divide, rounding half away from zero.
 *
 * §6.10 requires half-up rounding at the point a tax line is materialised.
 * "Half-up" here means away from zero rather than toward positive infinity: a
 * credit note carries negative amounts, and rounding −0.5 toward zero would
 * understate every refund by a paisa in exactly half of cases.
 *
 * Exported because the split allocator needs the same rule.
 */
export function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError('division by zero');

  const negative = numerator < 0n !== denominator < 0n;
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;

  // Adding half the divisor before truncating is exact integer half-up.
  const quotient = (absNumerator * 2n + absDenominator) / (absDenominator * 2n);

  return negative ? -quotient : quotient;
}

/**
 * Apply a rate in basis points, rounding half away from zero.
 *
 * Rates are stored as integer basis points and never as a float percentage
 * (§5.10): 8% is 800, not 0.08. On the Appendix A.1 base this is exact —
 * 1,222,000 × 800 ÷ 10,000 = 97,760 — but most orders are not, and this is the
 * single place the rounding happens.
 */
export function applyBps(base: Paisa, rateBps: number): Paisa {
  if (!Number.isInteger(rateBps)) {
    throw new TypeError(`rateBps must be an integer number of basis points, got ${rateBps}`);
  }
  return paisa(divideHalfUp(base * BigInt(rateBps), BPS_DIVISOR));
}

/**
 * Parse a decimal string such as `"530.00"` into paisa.
 *
 * Deliberately not `parseFloat` — which the R1 lint rule bans outright — and
 * deliberately not `Number()`. `"530.07"` through a float is 530.0699999...,
 * and this is the boundary where a price list or a fixture enters the system.
 */
export function parsePaisa(text: string): Paisa {
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (match === null) {
    throw new TypeError(`not a money amount: ${JSON.stringify(text)}`);
  }
  const sign = match[1];
  // Group 2 is `(\d+)` and cannot be absent once the pattern has matched.
  const rupees = match[2] as string;
  const paisaPart = (match[3] ?? '').padEnd(2, '0');
  const magnitude = BigInt(rupees) * PAISA_PER_RUPEE + BigInt(paisaPart);
  return paisa(sign === '-' ? -magnitude : magnitude);
}
