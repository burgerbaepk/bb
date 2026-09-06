import type { Metadata } from 'next';
import { MenuBrowser } from '@/components/MenuBrowser';
import { JsonLd } from '@/components/JsonLd';
import { readPopularItems, readPublicMenu } from '@/lib/menu/queries';
import { readOutletProfile } from '@/lib/outlet';
import { buildRestaurantJsonLd } from '@/lib/seo/jsonld';

import { readStoreSeo } from '@/lib/seo/queries';
import { pageMetadata } from '@/lib/seo/metadata';

/**
 * The menu — BUILD-PLAN.md §13.1, §13.2, §13.5.
 *
 * ISR at 300s. The markup, including every price, is rendered on the
 * server: §13.5 forbids fetching the menu client-side, because a menu a
 * crawler cannot see is a menu that does not rank.
 *
 * `?q=` is the header search landing here, and it is `noindex`: the query is
 * unbounded, so every crawlable permutation of it is a near-duplicate of this
 * page competing with it, and none of them is a page anyone linked to.
 */
export const revalidate = 300;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = await searchParams;
  const query = typeof params['q'] === 'string' ? params['q'].trim() : '';
  const seo = await readStoreSeo();
  return pageMetadata(seo, {
    title: query ? `Search: ${query}` : 'Menu',
    description: query ? `Search the ${seo.name} menu.` : seo.description,
    path: '/menu',
    noindex: query !== '',
  });
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = typeof params['q'] === 'string' ? params['q'] : '';
  const [menu, outlet, seo] = await Promise.all([
    readPublicMenu(),
    readOutletProfile(),
    readStoreSeo(),
  ]);
  const popular = await readPopularItems(menu);

  return (
    <>
      <JsonLd data={buildRestaurantJsonLd(outlet, menu, seo.baseUrl, seo)} />
      <MenuBrowser menu={menu} popular={popular} query={query} />
    </>
  );
}
