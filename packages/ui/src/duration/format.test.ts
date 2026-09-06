import { describe, expect, it } from 'vitest';
import { clampSeconds, durationState, formatDuration, formatOverdueBy } from './format';

/**
 * M01 gate G3 — `Duration` cannot render a negative value. BUILD-PLAN §2 R13,
 * defect V2.
 *
 * The system this replaces renders `-08:20` in red on the kitchen display.
 * These tests assert that no input reaches the screen as a negative, including
 * the inputs that actually cause it in production: clock skew between till and
 * server, and a row read before its timestamp is written.
 */
describe('R13 — no negative duration is representable', () => {
  const hostile = [
    -1,
    -59,
    -60,
    -61,
    -3599,
    -3600,
    -86_400,
    -0.5,
    -1e9,
    Number.NEGATIVE_INFINITY,
    Number.NaN,
    -Number.MAX_SAFE_INTEGER,
  ];

  it.each(hostile)('formatDuration(%s) renders no minus sign', (seconds) => {
    const rendered = formatDuration(seconds);
    expect(rendered).not.toContain('-');
    expect(rendered).toBe('00:00');
  });

  it.each(hostile)('clampSeconds(%s) is zero', (seconds) => {
    expect(clampSeconds(seconds)).toBe(0);
  });

  it('renders no minus sign for the exact production defect', () => {
    // V2: a KDS ticket rendered -08:20.
    expect(formatDuration(-500)).toBe('00:00');
  });

  it('never renders a negative overdue label', () => {
    // Elapsed below the threshold would be a negative overrun.
    expect(formatOverdueBy(60, 600)).toBe('00:00 over');
    expect(formatOverdueBy(-60, 600)).toBe('00:00 over');
  });
});

describe('formatDuration — §10.3 format', () => {
  it('renders mm:ss below one hour', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(9)).toBe('00:09');
    expect(formatDuration(70)).toBe('01:10');
    expect(formatDuration(521)).toBe('08:41'); // §11.3 "08:41 since check"
    expect(formatDuration(1450)).toBe('24:10'); // §9.2 dwell timer
    expect(formatDuration(3599)).toBe('59:59');
  });

  it('switches to hours at exactly one hour', () => {
    expect(formatDuration(3600)).toBe('1h 00m');
    expect(formatDuration(3840)).toBe('1h 04m');
    expect(formatDuration(86_399)).toBe('23h 59m');
  });

  it('truncates a fractional second rather than rounding up', () => {
    expect(formatDuration(59.9)).toBe('00:59');
  });
});

describe('formatOverdueBy — §10.3', () => {
  it('reports how late, not how long', () => {
    expect(formatOverdueBy(1360, 600)).toBe('12:40 over');
  });
});

describe('durationState — §10.3 bands', () => {
  const thresholds = { targetSeconds: 300, warnSeconds: 480, overdueSeconds: 600 };

  it('is OK below target', () => {
    expect(durationState(0, thresholds)).toBe('OK');
    expect(durationState(299, thresholds)).toBe('OK');
  });

  it('is WARN from target up to overdue', () => {
    expect(durationState(300, thresholds)).toBe('WARN');
    expect(durationState(599, thresholds)).toBe('WARN');
  });

  it('is OVERDUE from the overdue threshold', () => {
    expect(durationState(600, thresholds)).toBe('OVERDUE');
    expect(durationState(10_000, thresholds)).toBe('OVERDUE');
  });

  it('treats a negative elapsed as OK rather than OVERDUE', () => {
    // A clamp that produced OVERDUE would light the whole rail red on skew.
    expect(durationState(-1000, thresholds)).toBe('OK');
  });

  it('orders the bands by urgency', () => {
    // V3: the system this replaces has timer colours not ordered by urgency.
    const order = ['OK', 'WARN', 'OVERDUE'];
    const observed = [0, 400, 900].map((s) => durationState(s, thresholds));
    expect(observed).toEqual(order);
  });
});
