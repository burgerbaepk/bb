/**
 * Business-date arithmetic — BUILD-PLAN.md §5.8, §5.6, defect C6;
 * docs/runfiles/M14-storefront.md §3.
 *
 * A duplicate of `apps/pos/lib/orders/businessDateLogic.ts` — pure, stable,
 * and unit-tested against RFC-fixed inputs, not the concurrency-sensitive
 * kind of shared logic order-number allocation is (this runfile's own
 * reasoning for moving *that* into `packages/db` instead of copying it).
 * Split from `businessDate.ts` so this half can be unit-tested directly
 * without a `server-only` import in the way.
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
  if (match === null) return 5 * 3600;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  return hour * 3600 + minute * 60 + second;
}

/** The whole decision, unit-testable without a database. `at` is the current instant. */
export function computeBusinessDate(at: Date, config: BusinessDayConfig): string {
  const clock = zonedClock(at, config.timezone);
  const cutoffSeconds = parseCutoff(config.cutoff);

  const date = new Date(Date.UTC(clock.year, clock.month - 1, clock.day, 12));
  if (clock.seconds < cutoffSeconds) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().slice(0, 10);
}
