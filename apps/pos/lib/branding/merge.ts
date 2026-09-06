import { z } from 'zod';
import type { BrandConfig } from '@natech/branding';

/**
 * The save action's input shape and its read-modify-write merge — split out of
 * `actions.ts` because a `'use server'` file may only export async functions
 * (Next.js), and both of these are plain, synchronous, and worth unit-testing
 * without booting a database. See `actions.ts`'s module doc comment for why
 * the read-modify-write exists and what it deliberately excludes.
 *
 * BUILD-PLAN.md §14.3, §14.4, R12.
 */

/**
 * What `BrandingEditor` actually submits. A deliberate subset of
 * `BrandConfigSchema`: `typography.*`, `locale.*`, and `identity.legalName`
 * have no field here and so can only ever come from the stored config that
 * `mergeBrandConfig` overlays this onto.
 *
 * There is structurally nowhere for `VENDOR_FOOTER_LINE` (`@natech/contracts`)
 * to go: it is not a `BrandConfigSchema` field at all (§14.4), and adding a key
 * here that wrote to it would still need `BrandConfigSchema` itself extended
 * first, which the freeze (ADR 0008) forbids. `branding.test.ts` asserts this
 * schema has no such path.
 */
export const SaveBrandingInput = z.object({
  tradingName: z.string().trim().min(1, 'A trading name is required.'),
  tagline: z.string().trim(),
  logoLight: z.string().trim(),
  logoDark: z.string().trim(),
  logoReceipt: z.string().trim(),
  favicon: z.string().trim(),
  primary: z.string().trim().min(1, 'A primary colour is required.'),
  accent: z.string().trim().min(1, 'An accent colour is required.'),
  radius: z.enum(['sharp', 'soft', 'round']),
  mode: z.enum(['light', 'dark', 'system']),
  widthMm: z.enum(['58', '80']),
  showUrdu: z.enum(['true', 'false']),
  // Free text, split on the middle dot the field's own help text names.
  footerLines: z.string(),
});
export type SaveBrandingFields = z.infer<typeof SaveBrandingInput>;

/** Overlay the submitted fields onto the stored config. Everything else survives untouched. */
export function mergeBrandConfig(current: BrandConfig, input: SaveBrandingFields): BrandConfig {
  const footerLines = input.footerLines
    .split('·')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return {
    ...current,
    identity: {
      ...current.identity,
      tradingName: input.tradingName,
      tagline: input.tagline,
      logoLight: input.logoLight,
      logoDark: input.logoDark,
      logoReceipt: input.logoReceipt,
      favicon: input.favicon,
    },
    theme: {
      ...current.theme,
      primary: input.primary,
      accent: input.accent,
      radius: input.radius,
      mode: input.mode,
    },
    receipt: {
      ...current.receipt,
      widthMm: input.widthMm === '58' ? 58 : 80,
      showUrdu: input.showUrdu === 'true',
      footerLines,
    },
  };
}
