/**
 * Money formatting — BUILD-PLAN.md §2 R1, §6.10, §6.11, §15.2.
 *
 * This is the render boundary. Money is `bigint` paisa everywhere else in the
 * product; this module is the only place it becomes a string for a human, and
 * it gets there by integer arithmetic and string padding. No float is involved
 * at any point, so nothing here needs an exemption from `natech/no-float-money`.
 *
 * That matters beyond tidiness. `Intl.NumberFormat` and `toFixed` both take a
 * `number`, and 13809.60 is not representable in binary floating point. Routing
 * a total through either can move it by a paisa, and PSTSA s.17 makes excess tax
 * collected payable to Government.
 *
 * Grouping is Western and digits are Western, matching the reference invoice
 * (`12,220.00`) and §15.2, which requires Western digits for money even in Urdu
 * context so that a figure on screen matches the printed invoice exactly.
 */

const PAISA_PER_RUPEE = 100n;
const GROUP_SIZE = 3;

/** Insert a separator every three digits from the right: 12220 to 12,220. */
function groupThousands(digits: string): string {
  let out = '';
  for (let i = 0; i < digits.length; i += 1) {
    if (i > 0 && (digits.length - i) % GROUP_SIZE === 0) out += ',';
    out += digits[i];
  }
  return out;
}

export interface FormatPaisaOptions {
  /** Prefix with the currency symbol, e.g. `Rs. 13,809.60`. */
  readonly symbol?: string | undefined;
  /** Drop the decimals when the value is a whole number of rupees. */
  readonly trimWholeRupees?: boolean | undefined;
  /** Render a negative as `(1,234.00)`, the convention on a credit note. */
  readonly parenthesiseNegative?: boolean | undefined;
}

export function formatPaisa(value: bigint, options: FormatPaisaOptions = {}): string {
  const isNegative = value < 0n;
  const magnitude = isNegative ? -value : value;

  const rupees = magnitude / PAISA_PER_RUPEE;
  const fraction = magnitude % PAISA_PER_RUPEE;

  const whole = groupThousands(rupees.toString());
  const showFraction = !(options.trimWholeRupees === true && fraction === 0n);
  const body = showFraction ? `${whole}.${fraction.toString().padStart(2, '0')}` : whole;

  const withSymbol = options.symbol === undefined ? body : `${options.symbol} ${body}`;

  if (!isNegative) return withSymbol;
  return options.parenthesiseNegative === true ? `(${withSymbol})` : `-${withSymbol}`;
}
