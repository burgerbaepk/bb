import type { Metadata } from 'next';
import { MenuBrowser } from '@/components/MenuBrowser';
import { StoreHero } from '@/components/StoreHero';
import { JsonLd } from '@/components/JsonLd';
import { readPopularItems, readPublicMenu } from '@/lib/menu/queries';
import { readOutletProfile } from '@/lib/outlet';
import { buildRestaurantJsonLd } from '@/lib/seo/jsonld';

import { readStoreSeo } from '@/lib/seo/queries';
import { pageMetadata } from '@/lib/seo/metadata';

/** Homepage: supplied banner slider, outlet details, and the live menu. */
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return pageMetadata(await readStoreSeo());
}

export default async function Page() {
  const [menu, outlet, seo] = await Promise.all([
    readPublicMenu(),
    readOutletProfile(),
    readStoreSeo(),
  ]);
  // Depends on the menu, so it cannot join the batch above: `matchPopular`
  // refuses any sold name without a live, available item behind it.
  const popular = await readPopularItems(menu);
  return (
    <>
      <JsonLd data={buildRestaurantJsonLd(outlet, menu, seo.baseUrl, seo)} />
      <StoreHero outlet={outlet} />
      <MenuBrowser menu={menu} popular={popular} />
    </>
  );
}
