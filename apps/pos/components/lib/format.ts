import type { PaymentMethod } from '@natech/contracts';

/**
 * Presentation helpers shared across the POS surfaces.
 *
 * Nothing here formats money. `Money` in `@natech/ui` is the render boundary
 * (R1), and routing a figure through anything else is how a paisa goes missing
 * between a screen and an invoice.
 */

/** §6.4 — a rate is stated as a percentage beside the method it applies to. */
export function formatRate(rateBps: number): string {
  const whole = Math.floor(rateBps / 100);
  const fraction = rateBps % 100;
  return fraction === 0 ? `${whole}%` : `${whole}.${fraction.toString().padStart(2, '0')}%`;
}

export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  CASH: 'Cash',
  CARD: 'Card',
  WALLET: 'Wallet',
  QR: 'QR',
};

/**
 * A business date, labelled as one everywhere it appears (§5.8, defect C6).
 *
 * The system this replaces shows `INV-20260821-11266` against `22 Aug, 01:29`,
 * because it derives the date from the timestamp at read time instead of using
 * the business date stamped at finalize from the 05:00 cutoff.
 */
export const MONTH_ABBREVIATIONS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const;

/** Sunday first, matching `Date.prototype.getUTCDay()`. */
export const WEEKDAY_ABBREVIATIONS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

export function formatBusinessDate(businessDate: string): string {
  const [year, month, day] = businessDate.split('-');
  if (year === undefined || month === undefined || day === undefined) return businessDate;
  return `${day}-${MONTH_ABBREVIATIONS[Number(month) - 1] ?? month}-${year}`;
}

/** A wall-clock time, rendered in the outlet timezone at the render boundary. */
export function formatClock(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(at);
}

export function formatDateTime(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(at);
}

/** Quantity is thousandths (§5.6). `4000n` reads as `4`, `500n` as `0.5`. */
export function formatQty(qty: bigint): string {
  const units = qty / 1000n;
  const thousandths = qty % 1000n;
  if (thousandths === 0n) return units.toString();
  return `${units}.${thousandths.toString().padStart(3, '0').replace(/0+$/, '')}`;
}

/**
 * A share in basis points, rendered to one decimal by integer arithmetic.
 *
 * `.toFixed()` would be the obvious way and is banned by R1 outside the render
 * boundary — it takes a float, and the habit of reaching for it is what puts a
 * float in the money path two files later.
 */
export function formatShare(bps: number): string {
  const tenths = Math.round(bps / 10);
  return `${Math.floor(tenths / 10)}.${tenths % 10}%`;
}
