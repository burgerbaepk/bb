import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import ur from '@/messages/ur.json';
import { resolveLocale } from '@/i18n/locale';

/**
 * §15.1 — the one piece of the SSR locale fix that is pure enough to unit
 * test without rendering the root layout (a Server Component that reads the
 * outlet profile and the customer session — see `storefront.test.tsx`'s own
 * disclosed gap on DB-backed rendering). Everything downstream of this
 * function — `<html lang dir>`, the messages handed to
 * `NextIntlClientProvider` — is a deterministic function of its result.
 */
describe('resolveLocale', () => {
  it('reads Urdu from the cookie', () => {
    expect(resolveLocale('ur')).toBe('ur');
  });

  it('falls back to English for anything else, including undefined', () => {
    expect(resolveLocale('en')).toBe('en');
    expect(resolveLocale(undefined)).toBe('en');
    expect(resolveLocale('fr')).toBe('en');
    expect(resolveLocale('')).toBe('en');
  });
});

/**
 * §15.2 — Urdu is a shipped locale, not a partial one.
 *
 * A key added to `en.json` and forgotten in `ur.json` does not fail a build or
 * a render: `next-intl` falls back to the key path, so an Urdu customer is
 * shown `menu.popularHelp` where a sentence should be. It is invisible to
 * everyone who does not read the page in Urdu, which is why it is asserted
 * mechanically rather than left to review.
 */
function paths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    paths(child, prefix === '' ? key : `${prefix}.${key}`),
  );
}

describe('message catalogues', () => {
  it('carry exactly the same keys in both locales', () => {
    const english = paths(en).sort();
    const urdu = paths(ur).sort();
    expect(urdu.filter((key) => !english.includes(key))).toEqual([]);
    expect(english.filter((key) => !urdu.includes(key))).toEqual([]);
  });

  it('has no Urdu string left as its English original', () => {
    // A copied-across placeholder is the other half of the same failure, and
    // reads as a bug rather than as a missing translation.
    const suspicious = paths(en).filter((key) => {
      const read = (source: unknown) =>
        key
          .split('.')
          .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], source);
      const value = read(en);
      return typeof value === 'string' && value.length > 12 && read(ur) === value;
    });
    expect(suspicious).toEqual([]);
  });
});
