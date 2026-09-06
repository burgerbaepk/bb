import { describe, expect, it } from 'vitest';
import type { BrandConfig } from '@natech/branding';
import { mergeBrandConfig, SaveBrandingInput } from './merge';

/**
 * The save action's input schema and its read-modify-write merge —
 * BUILD-PLAN.md §14.3, §14.4, R12; docs/runfiles/M08-menu-floor-brand.md
 * gate G8.
 *
 * Both live in `merge.ts` rather than `actions.ts` specifically so they can be
 * exercised here without a database — `actions.ts` pulls in `requireOperator`
 * and `presignUpload`, both of which reach `server-only` modules that throw
 * outside a React Server Component context (CLAUDE.md's Vitest trap).
 */

/** Everything `SaveBrandingInput` requires — FormData values are always strings. */
const VALID_SUBMISSION = {
  tradingName: 'Test Kitchen',
  tagline: 'A new tagline',
  logoLight: 'branding/new-light.png',
  logoDark: 'branding/new-dark.png',
  logoReceipt: 'branding/new-receipt.png',
  favicon: 'branding/new-favicon.png',
  primary: 'oklch(50% 0.12 25)',
  accent: 'oklch(60% 0.14 60)',
  radius: 'round',
  mode: 'dark',
  widthMm: '58',
  showUrdu: 'true',
  footerLines: 'New line one · New line two',
} as const;

/** A stored config with distinctive values in every field the form does not edit. */
const CURRENT: BrandConfig = {
  identity: {
    tradingName: 'Old Kitchen',
    legalName: 'Old Kitchens (Private) Limited',
    tagline: 'Old tagline',
    logoLight: 'branding/old-light.png',
    logoDark: 'branding/old-dark.png',
    logoReceipt: 'branding/old-receipt.png',
    favicon: 'branding/old-favicon.png',
  },
  theme: {
    primary: 'oklch(40% 0.1 20)',
    surface: 'oklch(98% 0.005 90)',
    accent: 'oklch(55% 0.1 50)',
    danger: 'oklch(52% 0.19 25)',
    radius: 'sharp',
    mode: 'light',
  },
  typography: {
    display: 'Old Display, sans-serif',
    body: 'Old Body, sans-serif',
    mono: 'Old Mono, monospace',
    urdu: 'Old Urdu, serif',
  },
  locale: {
    default: 'ur',
    enabled: ['en', 'ur'],
    currency: 'PKR',
    timezone: 'Asia/Karachi',
  },
  receipt: {
    widthMm: 80,
    headerLines: ['Old header'],
    footerLines: ['Old footer'],
    showUrdu: false,
    paymentDetails: {
      bankName: '',
      iban: '',
      accountNumber: '',
      jazzCash: '',
      easyPaisa: '',
    },
  },
};

describe('SaveBrandingInput — the vendor line cannot travel through it (G8)', () => {
  it('declares no field named or shaped like the vendor line', () => {
    // `VENDOR_FOOTER_LINE` (@natech/contracts) is not a `BrandConfigSchema`
    // field at all, so there is structurally nowhere for a "vendor" key to
    // write to even if one were declared here — this just proves nobody
    // declared one.
    const keys = Object.keys(SaveBrandingInput.shape);
    expect(keys.some((key) => /vendor/i.test(key))).toBe(false);
  });

  it('drops an injected vendor field rather than carrying it through', () => {
    // Zod objects strip unknown keys by default (no `.passthrough()` here),
    // so an extra field on the submitted FormData — however it got there —
    // cannot ride along into the parsed result.
    const parsed = SaveBrandingInput.safeParse({
      ...VALID_SUBMISSION,
      vendorFooterLine: 'Powered by Whoever',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty('vendorFooterLine');
    }
  });
});

describe('mergeBrandConfig — read-modify-write', () => {
  it('overlays every field the form actually submits', () => {
    const merged = mergeBrandConfig(CURRENT, SaveBrandingInput.parse(VALID_SUBMISSION));

    expect(merged.identity.tradingName).toBe('Test Kitchen');
    expect(merged.identity.tagline).toBe('A new tagline');
    expect(merged.identity.logoLight).toBe('branding/new-light.png');
    expect(merged.theme.primary).toBe('oklch(50% 0.12 25)');
    expect(merged.theme.radius).toBe('round');
    expect(merged.theme.mode).toBe('dark');
    expect(merged.receipt.widthMm).toBe(58);
    expect(merged.receipt.showUrdu).toBe(true);
    expect(merged.receipt.footerLines).toEqual(['New line one', 'New line two']);
  });

  it('leaves typography, locale, and the legal name exactly as stored', () => {
    // BrandingEditor renders no control for any of these — a save that never
    // touched them must not be able to change them.
    const merged = mergeBrandConfig(CURRENT, SaveBrandingInput.parse(VALID_SUBMISSION));

    expect(merged.typography).toEqual(CURRENT.typography);
    expect(merged.locale).toEqual(CURRENT.locale);
    expect(merged.identity.legalName).toBe(CURRENT.identity.legalName);
  });

  it('leaves theme.surface and theme.danger untouched by a colour-only edit', () => {
    const merged = mergeBrandConfig(CURRENT, SaveBrandingInput.parse(VALID_SUBMISSION));

    expect(merged.theme.surface).toBe(CURRENT.theme.surface);
    expect(merged.theme.danger).toBe(CURRENT.theme.danger);
  });

  it('leaves receipt.headerLines untouched even though footerLines changes', () => {
    const merged = mergeBrandConfig(CURRENT, SaveBrandingInput.parse(VALID_SUBMISSION));

    expect(merged.receipt.headerLines).toEqual(CURRENT.receipt.headerLines);
  });

  it('drops blank segments when splitting footer lines on the middle dot', () => {
    const submission = SaveBrandingInput.parse({
      ...VALID_SUBMISSION,
      footerLines: '  ·  Only one  ·  ',
    });
    const merged = mergeBrandConfig(CURRENT, submission);
    expect(merged.receipt.footerLines).toEqual(['Only one']);
  });
});
