import type { MetadataRoute } from 'next';
import { readBrandConfig } from '@/lib/branding/queries';
import suppliedManifest from '../public/manifest.json';

export const dynamic = 'force-dynamic';

/**
 * Use the supplied icon set, with the terminal's current branding and identity.
 *
 * R12 — the colours come from the brand row, not from `public/manifest.json`.
 * A literal `theme_color` there tinted every deployment's installed app with
 * one client's red, which is the rebrand failure R12 exists to prevent. The
 * keys are omitted rather than defaulted when the row has no theme, so a
 * half-configured deployment gets the browser's own chrome instead of the
 * wrong colour.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const brand = await readBrandConfig();
  return {
    ...(suppliedManifest as MetadataRoute.Manifest),
    name: `${brand.identity.tradingName} POS`,
    short_name: 'POS',
    description: `${brand.identity.tradingName} — point of sale`,
    ...(brand.theme.primary === '' ? {} : { theme_color: brand.theme.primary }),
    ...(brand.theme.surface === '' ? {} : { background_color: brand.theme.surface }),
  };
}
