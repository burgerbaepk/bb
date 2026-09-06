import { z } from 'zod';

/**
 * The white-label configuration — BUILD-PLAN.md §14.3, R12.
 *
 * The product is re-brandable per client: one restaurant per deployment, and a
 * rebrand must be a database change, never a source change. That is what R12
 * enforces with the brand-grep gate, and this schema is the shape the database
 * row has to satisfy.
 *
 * `theme` values are resolved at runtime into CSS custom properties injected on
 * `<html>` by the root layout, over the Tailwind v4 `@theme` defaults in
 * `@natech/config/tailwind/theme.css`. No rebuild, and nothing in source that
 * could trip the gate.
 *
 * `logoReceipt` is separate from `logoLight` and `logoDark` on purpose: a
 * thermal printer needs 1-bit monochrome at most 384 dots wide (§15.3), and a
 * downscaled colour logo prints as a grey smear.
 */
export const BrandConfigSchema = z.object({
  identity: z.object({
    tradingName: z.string().min(1),
    legalName: z.string().min(1),
    tagline: z.string().optional(),
    logoLight: z.string(),
    logoDark: z.string(),
    /** 1-bit monochrome, 384 dots wide at most (§15.3). */
    logoReceipt: z.string(),
    favicon: z.string(),
  }),
  theme: z.object({
    primary: z.string(),
    surface: z.string(),
    accent: z.string(),
    danger: z.string(),
    radius: z.enum(['sharp', 'soft', 'round']),
    mode: z.enum(['light', 'dark', 'system']),
  }),
  typography: z.object({
    display: z.string(),
    body: z.string(),
    mono: z.string(),
    /** P9 resolved — Mehr Nastaliq Web, CC BY-SA 4.0, self-hosted. */
    urdu: z.string(),
  }),
  locale: z.object({
    default: z.enum(['en', 'ur']),
    enabled: z.array(z.enum(['en', 'ur'])),
    currency: z.literal('PKR'),
    timezone: z.string(),
  }),
  receipt: z.object({
    widthMm: z.union([z.literal(58), z.literal(80)]),
    headerLines: z.array(z.string()),
    footerLines: z.array(z.string()),
    showUrdu: z.boolean(),
    paymentDetails: z
      .object({
        bankName: z.string(),
        iban: z.string(),
        accountNumber: z.string(),
        jazzCash: z.string(),
        easyPaisa: z.string(),
      })
      .default({ bankName: '', iban: '', accountNumber: '', jazzCash: '', easyPaisa: '' }),
  }),
});

export type BrandConfig = z.infer<typeof BrandConfigSchema>;

/** §14.3 — `theme.radius` picks the base radius the whole scale derives from. */
export const RADIUS_REM: Readonly<Record<BrandConfig['theme']['radius'], string>> = {
  sharp: '0rem',
  // ADR 0020 — 10px, not 8px. `--radius-sm` and `--radius-lg` are derived from
  // this one value, so the whole scale moves with it; 8px left a card and the
  // pill inside it reading as the same shape at back-office density.
  soft: '0.625rem',
  round: '1rem',
};

/**
 * Resolve a brand config into the `--brand-*` custom properties the token layer
 * reads. Injected on `<html>` by the root layout in M08.
 *
 * Only the properties the operator actually chose are emitted. Everything else
 * falls through to the neutral defaults in the theme, which is what keeps a
 * half-configured deployment legible rather than half-black.
 */
export function brandCssVariables(config: BrandConfig): Readonly<Record<string, string>> {
  return {
    '--brand-primary': config.theme.primary,
    '--brand-surface': config.theme.surface,
    '--brand-accent': config.theme.accent,
    '--brand-danger': config.theme.danger,
    '--brand-radius-base': RADIUS_REM[config.theme.radius],
    '--brand-font-display': config.typography.display,
    '--brand-font-body': config.typography.body,
    '--brand-font-mono': config.typography.mono,
    '--brand-font-urdu': config.typography.urdu,
  };
}
