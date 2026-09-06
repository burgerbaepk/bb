import type { BrandConfig } from '@natech/branding';

/**
 * A brand configuration for review — BUILD-PLAN.md §14.3, R12.
 *
 * Invented, like the rest of the outlet identity, because restaurant identity
 * is database state and never source. The colours are `oklch` rather than hex
 * for the same reason the token layer is: hex is what the brand-grep gate hunts
 * for, and a perceptual space makes a light and dark pair of a brand colour
 * derivable rather than hand-picked twice.
 */
export const MOCK_BRAND: BrandConfig = {
  identity: {
    tradingName: 'Reference Kitchen',
    legalName: 'Reference Kitchens (Private) Limited',
    tagline: 'Charcoal grill since 1998',
    logoLight: 'brand/logo-light.svg',
    logoDark: 'brand/logo-dark.svg',
    /** §15.3 — 1-bit monochrome, 384 dots wide at most. */
    logoReceipt: 'brand/logo-receipt.png',
    favicon: 'brand/favicon.png',
  },
  theme: {
    primary: 'oklch(45% 0.12 25)',
    surface: 'oklch(99% 0.005 90)',
    accent: 'oklch(62% 0.14 60)',
    danger: 'oklch(52% 0.19 25)',
    radius: 'soft',
    mode: 'system',
  },
  typography: {
    display: 'ui-sans-serif, system-ui, sans-serif',
    body: 'ui-sans-serif, system-ui, sans-serif',
    mono: 'ui-monospace, monospace',
    /** P9 resolved — Mehr Nastaliq Web, CC BY-SA 4.0. */
    urdu: 'Mehr Nastaliq Web, serif',
  },
  locale: {
    default: 'en',
    enabled: ['en', 'ur'],
    currency: 'PKR',
    timezone: 'Asia/Karachi',
  },
  receipt: {
    widthMm: 80,
    headerLines: [],
    footerLines: ['Thank you. Please come again.'],
    showUrdu: true,
    paymentDetails: {
      bankName: '',
      iban: '',
      accountNumber: '',
      jazzCash: '',
      easyPaisa: '',
    },
  },
};
