import { describe, expect, it } from 'vitest';
import { BrandConfigSchema } from '@natech/branding';
import { FALLBACK_BRAND_CONFIG, parseBrandConfig } from './config';

/**
 * The Burger Bae fallback used before a database branding row is available.
 *
 * `readBrandConfig()` cannot be exercised here without a database (`queries.ts`
 * imports `server-only`, which throws outside a React Server Component
 * context — CLAUDE.md's Vitest trap), so this proves the fallback it falls
 * back to, and the parse both it and `saveBrandingAction` share.
 */
describe('FALLBACK_BRAND_CONFIG', () => {
  it('is itself a valid BrandConfig', () => {
    expect(BrandConfigSchema.safeParse(FALLBACK_BRAND_CONFIG).success).toBe(true);
  });

  it('uses the Burger Bae identity', () => {
    expect(FALLBACK_BRAND_CONFIG.identity.tradingName).toBe('Burger Bae');
    expect(FALLBACK_BRAND_CONFIG.identity.legalName).toBe('Burger Bae');
  });

  it('uses the red, black, and white palette', () => {
    expect(FALLBACK_BRAND_CONFIG.theme.primary).toBe('oklch(58% 0.22 28)');
    expect(FALLBACK_BRAND_CONFIG.theme.surface).toBe('oklch(99% 0 0)');
    expect(FALLBACK_BRAND_CONFIG.theme.accent).toBe('oklch(24% 0 0)');
  });

  /**
   * A destructive action on a till must never be mistakable for the primary
   * one, and this brand's primary *is* red. The gap is deliberate, so it is
   * asserted rather than left to whoever next edits the palette.
   */
  it('keeps danger darker and duller than the brand red', () => {
    expect(FALLBACK_BRAND_CONFIG.theme.danger).toBe('oklch(45% 0.16 22)');
    expect(FALLBACK_BRAND_CONFIG.theme.danger).not.toBe(FALLBACK_BRAND_CONFIG.theme.primary);
  });

  it('uses the project-owned Burger Bae marks', () => {
    expect(FALLBACK_BRAND_CONFIG.identity.logoLight).toBe('/images/burger-bae-logo.png');
    expect(FALLBACK_BRAND_CONFIG.identity.logoDark).toBe('/images/burger-bae-logo.png');
    expect(FALLBACK_BRAND_CONFIG.identity.logoReceipt).toBe('/images/burger-bae-logo-receipt.png');
    expect(FALLBACK_BRAND_CONFIG.identity.favicon).toBe('/images/burger-bae-icon.png');
  });
});

describe('parseBrandConfig', () => {
  it('falls back on a missing row (undefined)', () => {
    expect(parseBrandConfig(undefined)).toEqual(FALLBACK_BRAND_CONFIG);
  });

  it('falls back on a null value', () => {
    expect(parseBrandConfig(null)).toEqual(FALLBACK_BRAND_CONFIG);
  });

  it('falls back on a value that does not fit BrandConfigSchema', () => {
    expect(parseBrandConfig({ identity: { tradingName: 'Incomplete' } })).toEqual(
      FALLBACK_BRAND_CONFIG,
    );
  });

  it('falls back on a value of the wrong shape entirely', () => {
    expect(parseBrandConfig('not a brand config')).toEqual(FALLBACK_BRAND_CONFIG);
  });

  it('passes a valid row through unchanged', () => {
    const stored = {
      ...FALLBACK_BRAND_CONFIG,
      identity: { ...FALLBACK_BRAND_CONFIG.identity, tradingName: 'A Saved Trading Name' },
    };
    expect(parseBrandConfig(stored)).toEqual(stored);
  });
});
