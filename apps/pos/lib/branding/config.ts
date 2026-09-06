import { BrandConfigSchema, type BrandConfig } from '@natech/branding';

/**
 * The branded fallback and the defensive parse.
 *
 * Split out of `queries.ts` on purpose: that file imports `server-only`, which
 * throws when required outside a React Server Component context, a Vitest run
 * included (CLAUDE.md's Vitest trap — `lib/terminals/convert.ts` names the
 * same split for the same reason). `readBrandConfig()` and
 * `saveBrandingAction`'s read-modify-write both need this parse, and
 * `branding.test.ts` needs to call it without a database.
 */

export const BRANDING_SETTINGS_KEY = 'branding';

/**
 * `seedSettings()` (`packages/db/seeds/index.ts`) plants a row shaped like this
 * before any deployment goes live, so this path exists for the same reason
 * `idleLockSeconds()`'s fallback does: a fresh database, or a `settings` row a
 * malformed migration or a hand-edit left unparseable, must still render a
 * legible screen rather than take the whole app down at `<html>`.
 */
export const FALLBACK_BRAND_CONFIG: BrandConfig = {
  identity: {
    tradingName: 'Burger Bae',
    legalName: 'Burger Bae',
    tagline: 'Nobody grills like bae',
    logoLight: '/images/burger-bae-logo.png',
    logoDark: '/images/burger-bae-logo.png',
    logoReceipt: '/images/burger-bae-logo-receipt.png',
    favicon: '/images/burger-bae-icon.png',
  },
  // The wordmark is red on black over white. `primary` is that red and
  // `accent` the wordmark's black; `danger` is deliberately pulled darker and
  // duller than `primary` rather than left at the token layer's default red,
  // which sat close enough to the brand red to make a void or refund button
  // read as the primary action on a till (§4.2).
  theme: {
    primary: 'oklch(58% 0.22 28)',
    surface: 'oklch(99% 0 0)',
    accent: 'oklch(24% 0 0)',
    danger: 'oklch(45% 0.16 22)',
    radius: 'soft',
    mode: 'light',
  },
  // ADR 0020 — the bundled Geist, referenced through the variable each root
  // layout binds rather than by family name: `next/font` mangles the family it
  // registers, so naming "Geist" here would silently resolve to nothing.
  typography: {
    display: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
    body: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
    mono: 'var(--font-geist-mono), ui-monospace, monospace',
    urdu: 'Mehr Nastaliq Web, serif',
  },
  locale: {
    default: 'en',
    enabled: ['en'],
    currency: 'PKR',
    timezone: 'Asia/Karachi',
  },
  receipt: {
    widthMm: 80,
    headerLines: [],
    footerLines: [],
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

/**
 * Parse a `settings.value` payload against `BrandConfigSchema`, falling back
 * to the neutral placeholder on anything that does not fit — a missing row,
 * or one written by something other than `saveBrandingAction`.
 */
export function parseBrandConfig(raw: unknown): BrandConfig {
  if (raw === undefined || raw === null) return FALLBACK_BRAND_CONFIG;
  const parsed = BrandConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : FALLBACK_BRAND_CONFIG;
}
