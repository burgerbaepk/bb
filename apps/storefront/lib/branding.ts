import 'server-only';
import { eq } from 'drizzle-orm';
import { dbRead, settings } from '@natech/db';

/**
 * The brand's chrome colours — BUILD-PLAN.md §14.3, §2 R12.
 *
 * R12 keeps restaurant identity — name, NTN, address, phone, **brand hex** —
 * out of source and in `outlet_config` and `packages/db/seeds/`. The PWA
 * manifest and the `theme-color` meta tag are identity: they tint the Android
 * address bar and the installed app's splash screen, and a literal in either
 * ships one client's red to every deployment.
 *
 * Narrow on purpose. `apps/pos` reads the whole `BrandConfig` because it draws
 * the branding editor; the storefront wants two colours and has no need to
 * pull the schema, the typography or the receipt block behind them. The
 * storefront deliberately injects no `--brand-*` properties of its own (see
 * `app/layout.tsx`), and this does not change that — it reads the row for the
 * two places CSS custom properties cannot reach.
 *
 * Returns `null` for a colour that is missing or not a string rather than a
 * default, so a caller omits the key entirely and the browser falls back to
 * its own chrome. A half-configured deployment gets no tint, not the wrong one.
 */
export interface BrandChrome {
  readonly themeColor: string | null;
  readonly backgroundColor: string | null;
}

const BRANDING_SETTINGS_KEY = 'branding';

function readString(source: unknown, key: string): string | null {
  if (typeof source !== 'object' || source === null) return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

export async function readBrandChrome(): Promise<BrandChrome> {
  const rows = await dbRead()
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, BRANDING_SETTINGS_KEY))
    .limit(1);

  const theme =
    typeof rows[0]?.value === 'object' && rows[0].value !== null
      ? (rows[0].value as Record<string, unknown>)['theme']
      : null;

  return {
    themeColor: readString(theme, 'primary'),
    backgroundColor: readString(theme, 'surface'),
  };
}
