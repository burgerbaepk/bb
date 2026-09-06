/**
 * @natech/branding — white-label config resolution and theme injection.
 *
 * BUILD-PLAN.md §14.3, R12.
 *
 * Resolves `BrandConfigSchema` from the `branding` settings key and emits the
 * CSS custom properties the root layout injects over the Tailwind v4 `@theme`
 * defaults. A rebrand changes database rows, never source, which is what keeps
 * the R12 grep gate green.
 *
 * The schema and the variable mapping land in M05 with the branding editor;
 * the runtime resolution against the database lands in M08.
 */
export { BrandConfigSchema, RADIUS_REM, brandCssVariables, type BrandConfig } from './schema';
export { SeoSettingsSchema, SEO_SETTINGS_KEY, parseSeoSettings, type SeoSettings } from './seo';
