import 'server-only';
import { cache } from 'react';
import { inArray } from 'drizzle-orm';
import { dbRead, settings } from '@natech/db';
import { BrandConfigSchema, parseSeoSettings, SEO_SETTINGS_KEY } from '@natech/branding';
import { readOutletProfile } from '../outlet';
import { readPublicMenu } from '../menu/queries';
import { resolveStoreSeo } from './metadata';

/** React cache deduplicates metadata/layout/page reads within a request, never across requests. */
export const readStoreSeo = cache(async () => {
  const [rows, outlet, menu] = await Promise.all([
    dbRead()
      .select({ key: settings.key, value: settings.value })
      .from(settings)
      .where(inArray(settings.key, ['branding', SEO_SETTINGS_KEY])),
    readOutletProfile(),
    readPublicMenu(),
  ]);
  const brand = BrandConfigSchema.safeParse(rows.find((row) => row.key === 'branding')?.value);
  const seo = parseSeoSettings(rows.find((row) => row.key === SEO_SETTINGS_KEY)?.value);
  const indexable =
    process.env.NODE_ENV === 'production' &&
    (!process.env['VERCEL_ENV'] || process.env['VERCEL_ENV'] === 'production');
  return resolveStoreSeo(
    outlet,
    brand.success ? brand.data.identity : {},
    seo,
    menu.categories.map((category) => category.name),
    process.env['NEXT_PUBLIC_STOREFRONT_URL'] ||
      (process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : ''),
    indexable,
  );
});
