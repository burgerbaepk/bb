/**
 * Business-date arithmetic — BUILD-PLAN.md §5.8, §5.6, defect C6.
 *
 * Split out of `businessDate.ts` so this half — no database, no framework —
 * can be unit-tested directly. `businessDate.ts` carries `import 'server-only'`
 * (it reads `outlet_config`), and a vitest suite cannot resolve that import
 * outside a React Server Component context (the same trap
 * `lib/branding/config.test.ts`'s own doc comment names against
 * `lib/branding/queries.ts`) — so the file that needs testing must not carry
 * the guard, and the file that reads the database does.
 */

export interface BusinessDayConfig {
  readonly timezone: string;
  /** `HH:MM` or `HH:MM:SS`, as `outlet_config.business_day_cutoff` (a `time` column) round-trips it. */
  readonly cutoff: string;
}

interface ZonedClock {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly seconds: number;
}

/**
 * The wall-clock date and time-of-day `at` reads as, inside `timezone`.
 *
 * `Intl.DateTimeFormat` is used rather than a date-arithmetic library because
 * timezone offset rules (DST, historical changes) are exactly the thing a
 * hand-rolled offset table gets wrong; the platform's own tz database does not.
 */
function zonedClock(at: Date, timezone: string): ZonedClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const get = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  // Some ICU implementations render midnight as "24" under hour12: false
  // rather than "00" — normalised here so the seconds-of-day arithmetic below
  // never sees an out-of-range hour.
  const hour = get('hour') % 24;

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    seconds: hour * 3600 + get('minute') * 60 + get('second'),
  };
}

function parseCutoff(cutoff: string): number {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(cutoff);
  if (match === null) {
    // `outlet_config.business_day_cutoff` defaults to '05:00' in the schema
    // (packages/db/src/schema.ts) — the same fallback applies if a malformed
    // value ever reaches here, rather than throwing mid-order.
    return 5 * 3600;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  return hour * 3600 + minute * 60 + second;
}

/**
 * The whole decision, unit-testable without a database. `at` is the current
 * instant; the return value is a calendar date string (`YYYY-MM-DD`).
 */
export function computeBusinessDate(at: Date, config: BusinessDayConfig): string {
  const clock = zonedClock(at, config.timezone);
  const cutoffSeconds = parseCutoff(config.cutoff);

  // A pure calendar date, held at UTC noon so a day-subtraction can never be
  // pushed onto the wrong side of midnight by a timezone offset — this value
  // never represents an instant, only a date.
  const date = new Date(Date.UTC(clock.year, clock.month - 1, clock.day, 12));
  if (clock.seconds < cutoffSeconds) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().slice(0, 10);
}
