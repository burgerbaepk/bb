import type { MetadataRoute } from 'next';
import { readStoreSeo } from '@/lib/seo/queries';

export const dynamic = 'force-dynamic';

/** §13.5. `/t/`, `/order/`, `/checkout`, and `/api/` carry no customer value to a crawler and no fiscal or personal data may leak into an index. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const { baseUrl: base, indexable } = await readStoreSeo();
  return {
    rules: {
      userAgent: '*',
      allow: indexable ? ['/'] : undefined,
      disallow: indexable ? ['/t/', '/order/', '/checkout', '/api/'] : ['/'],
    },
    sitemap: base === '' ? undefined : `${base}/sitemap.xml`,
  };
}
