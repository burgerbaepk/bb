import { describe, expect, it } from 'vitest';
import { SettingValueError, formatSettingValue, parseSettingValue } from './serialise';

/**
 * §5.10, R1 — asserted against what the readers of `settings` require, not
 * against the implementation.
 *
 * Every case here is a way the setting silently reverts to its default: the
 * writer stores a type the reader rejects, and `readTaxPolicy()` /
 * `idleLockSeconds()` fall through to `DEFAULT_*` without anything failing.
 */
const NO_OPTIONS: readonly { readonly value: string }[] = [];
const ROUNDING = [{ value: 'NONE' }, { value: 'NEAREST_RUPEE' }];

describe('parseSettingValue', () => {
  it('stores a boolean as a JSON boolean, not as a string', () => {
    // `readTaxPolicy()` checks `typeof value === 'boolean'`. A stored "true"
    // reads as the default and the change appears to have been forgotten.
    expect(parseSettingValue('BOOLEAN', 'true', NO_OPTIONS)).toBe(true);
    expect(parseSettingValue('BOOLEAN', 'false', NO_OPTIONS)).toBe(false);
  });

  it('refuses anything else for a boolean', () => {
    expect(() => parseSettingValue('BOOLEAN', 'yes', NO_OPTIONS)).toThrow(SettingValueError);
  });

  it('stores an integer as a JSON number', () => {
    // `idleLockSeconds()` checks `typeof value !== 'number'`.
    expect(parseSettingValue('INTEGER', '300', NO_OPTIONS)).toBe(300);
  });

  it('refuses a fractional or negative integer', () => {
    expect(() => parseSettingValue('INTEGER', '1.5', NO_OPTIONS)).toThrow(SettingValueError);
    expect(() => parseSettingValue('INTEGER', '-1', NO_OPTIONS)).toThrow(SettingValueError);
    expect(() => parseSettingValue('INTEGER', '', NO_OPTIONS)).toThrow(SettingValueError);
  });

  it('holds basis points to the 0–10000 range', () => {
    expect(parseSettingValue('BPS', '500', NO_OPTIONS)).toBe(500);
    expect(() => parseSettingValue('BPS', '10001', NO_OPTIONS)).toThrow(SettingValueError);
  });

  it('stores money as a decimal string of paisa — R1', () => {
    // `readTaxPolicy()` parses `posFeePaisa` with `BigInt(value)` and only when
    // it is a string. A JSON number would lose paisa and invite a float back.
    expect(parseSettingValue('MONEY', '100', NO_OPTIONS)).toBe('100');
    expect(parseSettingValue('MONEY', '900719925474099100', NO_OPTIONS)).toBe('900719925474099100');
  });

  it('refuses a decimal or signed amount of paisa', () => {
    expect(() => parseSettingValue('MONEY', '1.00', NO_OPTIONS)).toThrow(SettingValueError);
    expect(() => parseSettingValue('MONEY', '-5', NO_OPTIONS)).toThrow(SettingValueError);
  });

  it('refuses an enum value outside its own options', () => {
    expect(parseSettingValue('ENUM', 'NEAREST_RUPEE', ROUNDING)).toBe('NEAREST_RUPEE');
    expect(() => parseSettingValue('ENUM', 'NEAREST_50', ROUNDING)).toThrow(SettingValueError);
  });
});

describe('formatSettingValue', () => {
  it('round-trips every kind back to the editor', () => {
    expect(formatSettingValue(parseSettingValue('BOOLEAN', 'true', NO_OPTIONS))).toBe('true');
    expect(formatSettingValue(parseSettingValue('INTEGER', '300', NO_OPTIONS))).toBe('300');
    expect(formatSettingValue(parseSettingValue('MONEY', '100', NO_OPTIONS))).toBe('100');
    expect(formatSettingValue(parseSettingValue('ENUM', 'NONE', ROUNDING))).toBe('NONE');
  });

  it('renders a missing row as empty rather than as "null"', () => {
    expect(formatSettingValue(null)).toBe('');
    expect(formatSettingValue(undefined)).toBe('');
  });
});
