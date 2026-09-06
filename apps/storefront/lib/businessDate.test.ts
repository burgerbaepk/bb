import { describe, expect, it } from 'vitest';
import { computeBusinessDate } from './businessDateLogic';

/**
 * §5.8, §5.6 — business date is the calendar day an order belongs to, not
 * the calendar day the clock currently reads. A duplicate of
 * `apps/pos/lib/orders/businessDate.test.ts` against the storefront's own
 * copy of the pure arithmetic (docs/runfiles/M14-storefront.md §3).
 */
describe('computeBusinessDate', () => {
  const config = { timezone: 'Asia/Karachi', cutoff: '05:00' };

  it('stays on the previous calendar day before the cutoff', () => {
    const at = new Date('2026-08-22T21:30:00Z'); // 02:30 PKT on the 23rd (UTC+5)
    expect(computeBusinessDate(at, config)).toBe('2026-08-22');
  });

  it('rolls to the new calendar day at the cutoff', () => {
    const at = new Date('2026-08-22T00:00:00Z'); // 05:00 PKT on the 22nd
    expect(computeBusinessDate(at, config)).toBe('2026-08-22');
  });

  it('stays on the current calendar day well after the cutoff', () => {
    const at = new Date('2026-08-22T09:00:00Z'); // 14:00 PKT on the 22nd
    expect(computeBusinessDate(at, config)).toBe('2026-08-22');
  });

  it('accepts a cutoff with seconds', () => {
    const config2 = { timezone: 'Asia/Karachi', cutoff: '05:00:00' };
    const at = new Date('2026-08-22T00:00:00Z'); // exactly 05:00 PKT
    expect(computeBusinessDate(at, config2)).toBe('2026-08-22');
  });

  it('falls back to the schema default cutoff on a malformed value', () => {
    const at = new Date('2026-08-22T00:00:00Z'); // 05:00 PKT — at the 05:00 default
    expect(computeBusinessDate(at, { timezone: 'Asia/Karachi', cutoff: 'nonsense' })).toBe(
      '2026-08-22',
    );
  });
});
