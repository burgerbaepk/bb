import { describe, expect, it } from 'vitest';
import { paisa } from '@natech/domain';
import { bucketise, trendWindowStart, type SalesSeriesRow } from './trend';

/**
 * Bucketing asserted against the calendar, not against the implementation —
 * BUILD-PLAN.md §5.8, §14.2.
 *
 * The cases that matter are all boundaries: a week that straddles two months, a
 * month arithmetic that must not roll 31 January through February, and a
 * business date sitting exactly on the far edge of the read window. Each of
 * these fails silently on a chart — the axis still draws twelve bars, they are
 * just the wrong twelve.
 */
function day(businessDate: string, grossRupees: number): SalesSeriesRow {
  return {
    businessDate,
    invoiceCount: 1,
    covers: 2,
    netSales: paisa(BigInt(grossRupees) * 100n),
    grossTakings: paisa(BigInt(grossRupees) * 100n),
  };
}

describe('bucketise', () => {
  it('lays out fourteen consecutive days ending on the business date', () => {
    const points = bucketise('DAILY', '2026-09-05', []);
    expect(points).toHaveLength(14);
    expect(points[0]?.key).toBe('2026-08-23');
    expect(points[13]?.key).toBe('2026-09-05');
    expect(points[13]?.partial).toBe(true);
    expect(points[12]?.partial).toBe(false);
  });

  it('keeps a day with no trade rather than closing the gap', () => {
    const points = bucketise('DAILY', '2026-09-05', [day('2026-09-04', 100)]);
    expect(points.filter((point) => point.grossTakings === 0n)).toHaveLength(13);
    expect(points[12]?.grossTakings).toBe(10_000n);
  });

  it('groups a week from its Monday, across a month boundary', () => {
    // 2026-08-31 is a Monday; 2026-09-01 is the Tuesday of the same week.
    const points = bucketise('WEEKLY', '2026-09-05', [
      day('2026-08-31', 10),
      day('2026-09-01', 20),
    ]);
    const week = points.find((point) => point.key === '2026-08-31');
    expect(week?.grossTakings).toBe(3_000n);
    expect(week?.invoiceCount).toBe(2);
    // Saturday 5 September falls in the week commencing Monday 31 August, so
    // that week is the one still in progress.
    expect(week?.partial).toBe(true);
  });

  it('walks months back without rolling a 31st through a short February', () => {
    const points = bucketise('MONTHLY', '2026-03-31', []);
    expect(points.map((point) => point.key)).toEqual([
      '2025-04-01',
      '2025-05-01',
      '2025-06-01',
      '2025-07-01',
      '2025-08-01',
      '2025-09-01',
      '2025-10-01',
      '2025-11-01',
      '2025-12-01',
      '2026-01-01',
      '2026-02-01',
      '2026-03-01',
    ]);
  });

  it('sums every day of a month into its bucket', () => {
    const points = bucketise('MONTHLY', '2026-09-05', [
      day('2026-07-01', 10),
      day('2026-07-31', 15),
      day('2026-09-05', 5),
    ]);
    expect(points.find((point) => point.key === '2026-07-01')?.grossTakings).toBe(2_500n);
    expect(points.find((point) => point.key === '2026-09-01')?.grossTakings).toBe(500n);
  });

  it('ignores a row outside the window instead of misfiling it', () => {
    const points = bucketise('DAILY', '2026-09-05', [day('2026-01-01', 999)]);
    expect(points.every((point) => point.grossTakings === 0n)).toBe(true);
  });

  it('labels the month only where it changes', () => {
    const points = bucketise('DAILY', '2026-09-05', []);
    expect(points[0]?.groupLabel).toBe('AUG');
    expect(points[1]?.groupLabel).toBeNull();
    expect(points.find((point) => point.key === '2026-09-01')?.groupLabel).toBe('SEP');
    expect(points[13]?.label).toBe('05');
  });
});

describe('trendWindowStart', () => {
  it('reaches the first day of the twelfth month back, so no grain reads short', () => {
    expect(trendWindowStart('2026-09-05')).toBe('2025-10-01');
    // The widest window must cover every grain's oldest bucket.
    const oldestWeek = bucketise('WEEKLY', '2026-09-05', [])[0]?.key ?? '';
    const oldestDay = bucketise('DAILY', '2026-09-05', [])[0]?.key ?? '';
    expect(trendWindowStart('2026-09-05') <= oldestWeek).toBe(true);
    expect(trendWindowStart('2026-09-05') <= oldestDay).toBe(true);
  });
});
