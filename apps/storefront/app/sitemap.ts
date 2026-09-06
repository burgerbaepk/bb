import type { MetadataRoute } from 'next';
import { readPublicMenu } from '@/lib/menu/queries';
import { readStoreSeo } from '@/lib/seo/queries';

// Sitemap entries come from the live menu, which is unavailable in secret-free CI.
export const dynamic = 'force-dynamic';

/**
 * §13.5 — generated from live categories and items, not hardcoded.
 * `/t/[token]` and `/order/[publicId]` are `noindex` (their own
 * `robots` metadata) and never listed here.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { baseUrl: base } = await readStoreSeo();
  if (!base) return [];
  const menu = await readPublicMenu();

  const itemUrls = menu.items.map((item) => ({
    url: `${base}/menu/${item.categorySlug}/${item.slug}`,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/menu`, changeFrequency: 'daily', priority: 0.9 },
    ...itemUrls,
  ];
}
