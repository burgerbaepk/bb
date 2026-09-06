import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ItemDetail } from '@/components/ItemDetail';
import { JsonLd } from '@/components/JsonLd';
import { readPublicMenu, readPublicMenuItem } from '@/lib/menu/queries';
import { buildMenuItemJsonLd } from '@/lib/seo/jsonld';

import { readStoreSeo } from '@/lib/seo/queries';
import { pageMetadata } from '@/lib/seo/metadata';

/**
 * Item detail — BUILD-PLAN.md §13.1, §13.5.
 *
 * Statically generated per item so a crawler and a customer get the same
 * HTML. `opengraph-image.tsx` beside this file supplies the `next/og` image
 * Next picks up automatically for `generateMetadata`'s `openGraph.images`.
 */
export async function generateStaticParams() {
  const hasDatabase = ['NEON_DATABASE_URL', 'NEON_DATABASE_URL_HTTP'].every((name) => {
    const value = process.env[name];
    return typeof value === 'string' && value.trim().length > 0;
  });
  if (!hasDatabase) return [];

  const menu = await readPublicMenu();
  return menu.items.map((item) => ({ category: item.categorySlug, slug: item.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}): Promise<Metadata> {
  const { category, slug } = await params;
  const item = await readPublicMenuItem(category, slug);
  if (item === null) notFound();
  const seo = await readStoreSeo();
  const sizes = item.variants.map((variant) => variant.name).join(', ');
  const description =
    item.description ||
    `Order ${item.name} from ${seo.name}${seo.city ? ` in ${seo.city}` : ''}.${sizes ? ` Available options: ${sizes}.` : ''} View the price and order online.`;
  return pageMetadata(seo, {
    title: item.name,
    description,
    path: `/menu/${category}/${slug}`,
    image: item.imageUrl || seo.image,
  });
}

export default async function Page({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const { category, slug } = await params;
  const item = await readPublicMenuItem(category, slug);
  if (item === null) notFound();

  return (
    <>
      <JsonLd data={buildMenuItemJsonLd(item)} />
      <ItemDetail item={item} />
    </>
  );
}
