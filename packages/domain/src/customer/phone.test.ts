import { describe, expect, it } from 'vitest';
import { canonicalPhone, formatPhone } from './phone';

/**
 * The property that matters is not "the regex works" — it is that every way one
 * person's number can be typed collapses to one string, because
 * `customers_phone_idx` is what decides whether they are one customer or two.
 */
describe('canonicalPhone — ADR 0022', () => {
  // Every entry is an invented number, and spelling the shapes out is the whole
  // point of the fixture — hence the per-line markers rather than a weaker gate.
  const same = [
    '03001234567', // brand-grep-allow
    '0300 1234567', // brand-grep-allow
    '0300-123-4567',
    '(0300) 1234567', // brand-grep-allow
    '+92 300 1234567', // brand-grep-allow
    '+923001234567', // brand-grep-allow
    '0092 300 1234567', // brand-grep-allow
    '3001234567',
  ];

  it('collapses every way the same number is written to one string', () => {
    const canonical = new Set(same.map(canonicalPhone));
    expect(canonical).toEqual(new Set(['03001234567'])); // brand-grep-allow
  });

  it.each([
    ['', 'empty'],
    ['0300123456', 'one digit short'],
    ['030012345678', 'one digit long'],
    ['0421234567', 'a landline, not a mobile'],
    ['02001234567', 'not an 03 prefix'],
    ['not a number', 'not digits at all'],
    ['+44 7700 900123', 'a foreign mobile'],
  ])('rejects %s (%s)', (input) => {
    expect(canonicalPhone(input)).toBeNull();
  });

  it('is idempotent, so re-saving a stored number cannot change it', () => {
    const once = canonicalPhone('+92 300 1234567'); // brand-grep-allow
    expect(once).not.toBeNull();
    expect(canonicalPhone(once as string)).toBe(once);
  });

  it('formats for reading without changing what is stored', () => {
    expect(formatPhone('03001234567')).toBe('0300 1234567'); // brand-grep-allow
    // Anything not canonical is handed back untouched rather than sliced into
    // nonsense — the till has rows predating ADR 0022's normalisation.
    expect(formatPhone('021-111-222')).toBe('021-111-222');
  });
});
