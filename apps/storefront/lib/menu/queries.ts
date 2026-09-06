import 'server-only';
import { variantImageUrl } from './images';
import { cache } from 'react';
import { and, asc, between, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  categories,
  dbRead,
  invoices,
  itemVariants,
  menuItems,
  orderLines,
  orders,
} from '@natech/db';
import { paisa } from '@natech/domain';
import type { PublicCategory, PublicMenu, PublicMenuItem } from '@natech/contracts';
import { POPULAR_LIMIT, matchPopular } from './popular';

/** Parent photographs use the stored image key; consolidated sizes resolve their own assets below. */
function productImageUrl(imageKey: string | null): string | null {
  return imageKey === null ? null : `/images/${imageKey}`;
}

/**
 * The public menu — BUILD-PLAN.md §13.1, §13.2, §5.3; docs/runfiles/
 * M14-storefront.md §3.
 *
 * Neither `menu_items` nor `categories` carries a `slug` column (frozen at
 * M02) — the mock dataset's own `slug` field is synthetic, built only for
 * the Phase-1 UI. Real slugs are derived here: a kebab-case of the name, with
 * a short suffix of the row's own id so two items sharing a name (a real
 * case — "Roghni Nan" appears under more than one category) never collide on
 * one URL. Never stored; both the listing and the detail-page reverse lookup
 * (`readPublicMenuItem`) compute it the same way, so the two can never
 * disagree about what an item's slug is.
 *
 * Size families share one item and expose their original prices through
 * variants (ADR 0022). The same records power the till and storefront.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** The one place a slug is computed — id-suffixed so it is always unique, never re-derived differently elsewhere. */
export function deriveSlug(name: string, id: string): string {
  const base = slugify(name);
  const suffix = id.replace(/-/g, '').slice(0, 8);
  return base === '' ? suffix : `${base}-${suffix}`;
}

export const readPublicMenu = cache(async (): Promise<PublicMenu> => {
  const [categoryRows, itemRows, variantRows] = await Promise.all([
    dbRead()
      .select({
        id: categories.id,
        name: categories.name,
        nameUr: categories.nameUr,
        sortOrder: categories.sortOrder,
      })
      .from(categories)
      .where(and(eq(categories.isActive, true), isNull(categories.deletedAt))),
    dbRead()
      .select({
        id: menuItems.id,
        sku: menuItems.sku,
        categoryId: menuItems.categoryId,
        name: menuItems.name,
        nameUr: menuItems.nameUr,
        description: menuItems.description,
        descriptionUr: menuItems.descriptionUr,
        imageKey: menuItems.imageKey,
        basePrice: menuItems.basePrice,
        isActive: menuItems.isActive,
      })
      .from(menuItems)
      .where(and(eq(menuItems.isActive, true), isNull(menuItems.deletedAt))),
    dbRead()
      .select({
        id: itemVariants.id,
        menuItemId: itemVariants.menuItemId,
        name: itemVariants.name,
        nameUr: itemVariants.nameUr,
        priceDelta: itemVariants.priceDelta,
        isDefault: itemVariants.isDefault,
      })
      .from(itemVariants)
      .where(isNull(itemVariants.deletedAt))
      .orderBy(asc(itemVariants.priceDelta), asc(itemVariants.name)),
  ]);

  const publicCategories: PublicCategory[] = categoryRows
    .map((row) => ({
      id: row.id,
      slug: deriveSlug(row.name, row.id),
      name: row.name,
      nameUr: row.nameUr,
      sortOrder: row.sortOrder,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const categorySlugById = new Map(
    publicCategories.map((category) => [category.id, category.slug]),
  );

  const variantsByItem = new Map<string, typeof variantRows>();
  for (const row of variantRows) {
    const list = variantsByItem.get(row.menuItemId) ?? [];
    list.push(row);
    variantsByItem.set(row.menuItemId, list);
  }

  const items: PublicMenuItem[] = itemRows.map((item) => ({
    id: item.id,
    slug: deriveSlug(item.name, item.id),
    categorySlug: categorySlugById.get(item.categoryId) ?? '',
    name: item.name,
    nameUr: item.nameUr,
    description: item.description,
    descriptionUr: item.descriptionUr,
    imageUrl: productImageUrl(item.imageKey),
    priceExTax: paisa(item.basePrice),
    variants: (variantsByItem.get(item.id) ?? []).map((variant) => ({
      id: variant.id,
      name: variant.name,
      nameUr: variant.nameUr,
      priceExTax: paisa(item.basePrice + variant.priceDelta),
      isDefault: variant.isDefault,
      imageUrl: variantImageUrl(item.sku, variant.name) ?? productImageUrl(item.imageKey),
    })),
    isAvailable: item.isActive,
  }));

  return { categories: publicCategories, items };
});

/** The item-detail route's reverse lookup — same derivation as `readPublicMenu`, so the two never disagree. */
export async function readPublicMenuItem(
  categorySlug: string,
  itemSlug: string,
): Promise<PublicMenuItem | null> {
  const menu = await readPublicMenu();
  return (
    menu.items.find((item) => item.categorySlug === categorySlug && item.slug === itemSlug) ?? null
  );
}

/**
 * The most ordered dishes over a trailing window — §13.1, §2 R1, R16;
 * docs/runfiles/M22-storefront-layout.md §3.
 *
 * Same shape as `apps/pos/lib/dashboard/queries.ts`'s `readTopItems`, and for
 * the same reasons: one grouped aggregate rather than a fold over every line,
 * exact `numeric` arithmetic with no float anywhere near it (R1), voided lines
 * excluded because a voided line was never charged, and grouping on
 * `nameSnapshot` because the snapshot is what the guest was charged for.
 *
 * `matchPopular` then decides what may actually be shown; see `popular.ts` for
 * why the lookup runs sales-into-menu and not the other way round. An empty
 * result is a real answer — the caller renders no rail rather than a filler
 * one, because a "Most ordered" list with nothing behind it is worse than none.
 */
const POPULAR_WINDOW_DAYS = 30;
/** Below this, "most ordered" is noise dressed up as a recommendation. */
const POPULAR_MIN_SOLD = 3;

function businessDateDaysAgo(days: number): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

export const readPopularItems = cache(
  async (menu: PublicMenu): Promise<readonly PublicMenuItem[]> => {
    const soldCount = sql<number>`count(*)::int`;
    const rows = await dbRead()
      .select({ name: orderLines.nameSnapshot, soldCount })
      .from(orderLines)
      .innerJoin(orders, eq(orderLines.orderId, orders.id))
      .innerJoin(invoices, eq(invoices.orderId, orders.id))
      .where(
        and(
          between(
            invoices.businessDate,
            businessDateDaysAgo(POPULAR_WINDOW_DAYS),
            businessDateDaysAgo(0),
          ),
          isNull(orderLines.voidReason),
          isNull(invoices.deletedAt),
          isNull(orderLines.deletedAt),
        ),
      )
      .groupBy(orderLines.nameSnapshot)
      .having(sql`count(*) >= ${POPULAR_MIN_SOLD}`)
      .orderBy(desc(soldCount))
      // Over-fetch: `matchPopular` drops names with no live menu item behind
      // them, so asking for exactly the limit would under-fill the rail.
      .limit(POPULAR_LIMIT * 3);

    return matchPopular(menu, rows);
  },
);
