import type { SettingKind } from '@natech/contracts';

/**
 * Between the editor's string form and the jsonb form — BUILD-PLAN.md §5.10,
 * §2 R1; docs/runfiles/M21-settings-registry.md §3.
 *
 * `settings.value` is jsonb, so a boolean is stored as a JSON boolean and an
 * integer as a JSON number — storing `"true"` would work until something read
 * it back with `typeof value === 'boolean'`, which `idleLockSeconds()` and
 * `readTaxPolicy()` both do, and then the setting would silently revert to its
 * default. Every reader in this repository type-checks what it finds, so the
 * writer has to produce the type the reader expects, per kind.
 *
 * `MONEY` is the exception and the reason this is a module rather than a
 * ternary. R1 says money is `bigint` paisa; `JSON.stringify` throws on a
 * `bigint`, and a JSON number loses paisa above 2^53 and invites a float on
 * the way back in. So paisa crosses jsonb as a decimal string, which is the
 * shape `readTaxPolicy()` already parses (`typeof value['posFeePaisa'] ===
 * 'string'`) and the shape `saveServiceChargeSettingsAction` already writes.
 *
 * Pure, and framework-free, so the round trip can be asserted directly.
 */
export class SettingValueError extends Error {}

/** The editor's string, validated and converted to what belongs in jsonb. */
export function parseSettingValue(
  kind: SettingKind,
  raw: string,
  options: readonly { readonly value: string }[],
): string | number | boolean | string[] {
  const text = raw.trim();

  switch (kind) {
    case 'BOOLEAN': {
      if (text === 'true') return true;
      if (text === 'false') return false;
      throw new SettingValueError('Expected true or false.');
    }
    case 'INTEGER': {
      const value = Number(text);
      if (text === '' || !Number.isInteger(value))
        throw new SettingValueError('Expected a whole number.');
      if (value < 0) throw new SettingValueError('Cannot be negative.');
      return value;
    }
    case 'BPS': {
      const value = Number(text);
      if (text === '' || !Number.isInteger(value))
        throw new SettingValueError('Expected a whole number.');
      // Basis points, never a float percentage (§5.10). 10,000 bps is 100%.
      if (value < 0 || value > 10_000) throw new SettingValueError('Must be between 0 and 10000.');
      return value;
    }
    case 'MONEY': {
      // Integer arithmetic only — `Number(text)` here would be the float in
      // the money path R1 exists to prevent, on the way into storage.
      if (!/^\d+$/.test(text)) throw new SettingValueError('Expected an amount in paisa.');
      return BigInt(text).toString();
    }
    case 'ENUM': {
      if (!options.some((option) => option.value === text)) {
        throw new SettingValueError('Not one of the permitted values.');
      }
      return text;
    }
    case 'ENUM_LIST': {
      const values = text === '' ? [] : text.split(',').map((part) => part.trim());
      for (const value of values) {
        if (!options.some((option) => option.value === value)) {
          throw new SettingValueError('Not one of the permitted values.');
        }
      }
      return values;
    }
    case 'TEXT_LIST':
      return text === '' ? [] : text.split(',').map((part) => part.trim());
    case 'TEXT':
    case 'TIME':
      return text;
  }
}

/** What is in jsonb, as the editor and the history list show it. */
export function formatSettingValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map((entry) => String(entry)).join(',');
  return String(value);
}
