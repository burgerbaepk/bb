/**
 * Opening hours, as a customer reads them — §13.5.
 *
 * `outlet_config.store_open` is a Postgres `time`, and the driver hands it back
 * as `HH:MM:SS`. Rendered raw that becomes "16:00:00 – 02:30:00", which is a
 * database value on a shop window: seconds nobody needs, and a 24-hour clock
 * that reads as a departure board. This is the one formatter, shared by
 * `StoreHero` and the footer, so the two can never disagree about the hours of
 * the same restaurant.
 *
 * Deliberately not `Intl.DateTimeFormat`: a time of day is not an instant, so
 * formatting one through a Date means inventing a date and a timezone for it,
 * and the outlet's own timezone is not the viewer's. Integer arithmetic on the
 * string cannot drift across a DST boundary the way that would.
 *
 * `null` for anything it cannot read, so a caller falls back to its own
 * "contact the restaurant" copy rather than printing a half-parsed time.
 */
export function formatClock(value: string | null): string | null {
  if (value === null) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (match === null) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || hour > 23 || !Number.isInteger(minute) || minute > 59) return null;
  const suffix = hour < 12 ? 'am' : 'pm';
  // 00:30 is half past midnight, not half past zero; 12:30 is half past noon.
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${String(minute).padStart(2, '0')} ${suffix}`;
}

/** The pair, or null when either end is missing or unreadable. */
export function formatOpeningHours(open: string | null, close: string | null): string | null {
  const from = formatClock(open);
  const to = formatClock(close);
  return from === null || to === null ? null : `${from} – ${to}`;
}
