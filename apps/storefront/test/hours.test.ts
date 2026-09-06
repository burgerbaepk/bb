import { describe, expect, it } from 'vitest';
import { formatClock, formatOpeningHours } from '@/lib/hours';

describe('opening hours', () => {
  it('drops the seconds a Postgres time column carries', () => {
    // The real defect: "16:00:00 – 02:30:00" on the storefront footer.
    expect(formatOpeningHours('16:00:00', '02:30:00')).toBe('4:00 pm – 2:30 am');
  });

  it('reads midnight and noon as twelve, not zero', () => {
    expect(formatClock('00:30')).toBe('12:30 am');
    expect(formatClock('12:05')).toBe('12:05 pm');
    expect(formatClock('23:59')).toBe('11:59 pm');
  });

  it('returns null rather than half a time', () => {
    expect(formatClock(null)).toBeNull();
    expect(formatClock('')).toBeNull();
    expect(formatClock('25:00')).toBeNull();
    expect(formatOpeningHours('09:00', null)).toBeNull();
  });
});
