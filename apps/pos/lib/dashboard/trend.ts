import { paisa, type Paisa } from '@natech/domain';
import {
  MONTH_ABBREVIATIONS,
  WEEKDAY_ABBREVIATIONS,
  formatBusinessDate,
} from '@/components/lib/format';

/**
 * Business-date bucketing for the dashboard sales trend — BUILD-PLAN.md §5.8,
 * §14.2, §2 R1, R16.
 *
 * Deliberately free of `server-only` and of every framework import: the server
 * page uses it to work out how far back to read, and the client chart uses it
 * to lay the same window out in bars. One implementation is the point. If the
 * two ever computed their own windows, the query would read eleven months and
 * the axis would claim twelve, and nothing would fail — the chart would just be
 * quietly wrong at its left edge, which is the C3/V1 shape R16 exists to stop.
 *
 * Every date here is a business date (§5.8) — the plain `YYYY-MM-DD` stamped at
 * finalize from the 05:00 cutoff, never a timestamp resolved to a date at read
 * time (defect C6). Arithmetic goes through `Date` at UTC noon, the same trick
 * `lib/reports/range.ts` uses, so a daylight-saving shift in the outlet
 * timezone can never move a business date by a day.
 */

export const TREND_GRAINS = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;
export type TrendGrain = (typeof TREND_GRAINS)[number];

/** One business date's finalized trade. The row shape the series query returns. */
export interface SalesSeriesRow {
  readonly businessDate: string;
  readonly invoiceCount: number;
  readonly covers: number;
  readonly netSales: Paisa;
  readonly grossTakings: Paisa;
}

export interface TrendPoint {
  /** The first business date in the bucket. Stable across renders, so it is the React key. */
  readonly key: string;
  /** The axis tick. Short by design — twelve of these share the width of a card. */
  readonly label: string;
  /**
   * Rendered above the tick only where it changes — month for daily and weekly,
   * year for monthly. A chart that repeats "SEP" fourteen times has spent
   * fourteen labels saying one thing.
   */
  readonly groupLabel: string | null;
  /** The unabbreviated period, for the readout and the screen reader. */
  readonly fullLabel: string;
  /** The bucket the outlet is still trading in. Its bar is not comparable to a whole one. */
  readonly partial: boolean;
  readonly invoiceCount: number;
  readonly covers: number;
  readonly netSales: Paisa;
  readonly grossTakings: Paisa;
}

function toDate(businessDate: string): Date {
  return new Date(`${businessDate}T12:00:00Z`);
}

function toBusinessDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function shiftDays(businessDate: string, delta: number): string {
  const value = toDate(businessDate);
  value.setUTCDate(value.getUTCDate() + delta);
  return toBusinessDate(value);
}

/** The Monday of the week a business date falls in. `getUTCDay()` is 0 on Sunday. */
function weekStart(businessDate: string): string {
  return shiftDays(businessDate, -((toDate(businessDate).getUTCDay() + 6) % 7));
}

function monthStart(businessDate: string): string {
  return `${businessDate.slice(0, 7)}-01`;
}

function shiftMonths(businessDate: string, delta: number): string {
  const value = toDate(businessDate);
  // The day is pinned to the 1st in the same call as the month. Setting the
  // month alone on the 31st of a month rolls 31 January back through February
  // and lands on 3 March, which would silently drop a month from the axis.
  value.setUTCMonth(value.getUTCMonth() + delta, 1);
  return toBusinessDate(value);
}

interface GrainSpec {
  readonly buckets: number;
  /** The bucket a given business date belongs to, named by its first date. */
  readonly bucketOf: (businessDate: string) => string;
  /** `n` buckets before this one. */
  readonly back: (key: string, n: number) => string;
  readonly axisNote: string;
}

const SPECS: Readonly<Record<TrendGrain, GrainSpec>> = {
  DAILY: {
    buckets: 14,
    bucketOf: (businessDate) => businessDate,
    back: (key, n) => shiftDays(key, -n),
    axisNote: 'Day of month',
  },
  WEEKLY: {
    buckets: 12,
    bucketOf: weekStart,
    back: (key, n) => shiftDays(key, -n * 7),
    axisNote: 'Week commencing',
  },
  MONTHLY: {
    buckets: 12,
    bucketOf: monthStart,
    back: (key, n) => shiftMonths(key, -n),
    axisNote: 'Month',
  },
};

export function axisNote(grain: TrendGrain): string {
  return SPECS[grain].axisNote;
}

/**
 * The earliest business date any grain can ask for — the first day of the
 * twelfth month back. The series is read once over this window and re-bucketed
 * in the browser, so switching grain costs no round trip and no second query
 * that could disagree with the first.
 */
export function trendWindowStart(today: string): string {
  const monthly = SPECS.MONTHLY;
  return monthly.back(monthly.bucketOf(today), monthly.buckets - 1);
}

function monthAbbreviation(businessDate: string): string {
  return MONTH_ABBREVIATIONS[Number(businessDate.slice(5, 7)) - 1] ?? businessDate.slice(5, 7);
}

function weekdayAbbreviation(businessDate: string): string {
  return WEEKDAY_ABBREVIATIONS[toDate(businessDate).getUTCDay()] ?? '';
}

function labelFor(
  grain: TrendGrain,
  key: string,
  previous: string | undefined,
): { readonly label: string; readonly groupLabel: string | null; readonly fullLabel: string } {
  if (grain === 'MONTHLY') {
    const year = key.slice(0, 4);
    return {
      label: monthAbbreviation(key),
      groupLabel: previous === undefined || previous.slice(0, 4) !== year ? year : null,
      fullLabel: `${monthAbbreviation(key)} ${year}`,
    };
  }
  const changedMonth = previous === undefined || previous.slice(0, 7) !== key.slice(0, 7);
  return {
    label: key.slice(8),
    groupLabel: changedMonth ? monthAbbreviation(key) : null,
    fullLabel:
      grain === 'DAILY'
        ? `${weekdayAbbreviation(key)} ${formatBusinessDate(key)}`
        : `Week of ${formatBusinessDate(key)}`,
  };
}

/**
 * Lay a daily series out as `spec.buckets` consecutive buckets ending on today.
 *
 * Buckets with no trade are kept, not dropped. A day the outlet was shut is a
 * fact about the week, and a chart that closes the gap turns a two-day holiday
 * into a plain line and hides it.
 */
export function bucketise(
  grain: TrendGrain,
  today: string,
  rows: readonly SalesSeriesRow[],
): readonly TrendPoint[] {
  const spec = SPECS[grain];
  const current = spec.bucketOf(today);
  const keys = Array.from({ length: spec.buckets }, (_unused, i) =>
    spec.back(current, spec.buckets - 1 - i),
  );

  const totals = new Map(
    keys.map((key) => [key, { invoiceCount: 0, covers: 0, netSales: 0n, grossTakings: 0n }]),
  );
  for (const row of rows) {
    const bucket = totals.get(spec.bucketOf(row.businessDate));
    // A row outside the window is not an error: the query reads the widest
    // grain's window, so the daily view legitimately ignores most of it.
    if (bucket === undefined) continue;
    bucket.invoiceCount += row.invoiceCount;
    bucket.covers += row.covers;
    bucket.netSales += row.netSales;
    bucket.grossTakings += row.grossTakings;
  }

  return keys.map((key, i) => {
    const bucket = totals.get(key);
    if (bucket === undefined) throw new Error('unreachable: seeded from the same keys');
    return {
      key,
      ...labelFor(grain, key, keys[i - 1]),
      partial: key === current,
      invoiceCount: bucket.invoiceCount,
      covers: bucket.covers,
      netSales: paisa(bucket.netSales),
      grossTakings: paisa(bucket.grossTakings),
    };
  });
}
