import 'server-only';
import { eq } from 'drizzle-orm';
import { dbRead, settings } from '@natech/db';
import type { BrandConfig } from '@natech/branding';
import { BRANDING_SETTINGS_KEY, parseBrandConfig } from './config';

/**
 * Live theme resolution — BUILD-PLAN.md §14.3, R12; docs/runfiles/M08-menu-floor-brand.md §3.
 *
 * `packages/branding`'s own doc comment names the split this file closes: the
 * schema and the CSS-variable mapping landed in M05 with the branding editor;
 * resolving that schema against the database is M08's job, and this is it. The
 * root layout calls `readBrandConfig()` on every request and hands the result
 * to `brandCssVariables()`, so a rebrand is a row in `settings`, never a
 * rebuild.
 *
 * R2 — `dbRead` throughout. Nothing here writes; `saveBrandingAction`
 * (`./actions.ts`) does its own read inside the `dbWrite` transaction rather
 * than calling into this module, because a read immediately before a write has
 * to see that write's own transaction, not the HTTP driver's view of the
 * world.
 */

/** The root layout's source of truth for `brandCssVariables()`, every request. */
export async function readBrandConfig(): Promise<BrandConfig> {
  const rows = await dbRead()
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, BRANDING_SETTINGS_KEY))
    .limit(1);

  return parseBrandConfig(rows[0]?.value);
}
