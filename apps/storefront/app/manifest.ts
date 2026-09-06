import type { MetadataRoute } from 'next';
import { readStoreSeo } from '@/lib/seo/queries';
import { readBrandChrome } from '@/lib/branding';
import suppliedManifest from '../public/manifest.json';

export const dynamic = 'force-dynamic';

/**
 * R12 — the colours come from the brand row, not from `public/manifest.json`.
 * A literal `theme_color` there gave every deployment's installed app one
 * client's red, which is precisely the rebrand failure R12 exists to prevent.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [seo, chrome] = await Promise.all([readStoreSeo(), readBrandChrome()]);
  return {
    ...(suppliedManifest as MetadataRoute.Manifest),
    name: seo.name,
    description: seo.description,
    short_name: seo.name,
    ...(chrome.themeColor === null ? {} : { theme_color: chrome.themeColor }),
    ...(chrome.backgroundColor === null ? {} : { background_color: chrome.backgroundColor }),
  };
}
