import type { PublicMenu, PublicMenuItem } from '@natech/contracts';

/**
 * Which dishes may be called popular — BUILD-PLAN.md §13.1, defect C4;
 * docs/runfiles/M22-storefront-layout.md §3.
 *
 * The reference design leads with a "Popular" rail, and it is the one element
 * on that page which cannot honestly be invented here: there is no curation
 * flag on `menu_items` and `PublicMenuItem` is frozen (ADR 0008). So it is
 * measured instead — `readPopularItems` in `queries.ts` counts what customers
 * actually bought — and this module decides what the count is allowed to put
 * on a public page.
 *
 * Framework-free and free of `server-only` on purpose, so the C4 guarantee
 * below can be asserted without a database. Same split as
 * `apps/pos/lib/dashboard/trend.ts` and `lib/webOrders/alerting.ts`.
 */
export const POPULAR_LIMIT = 6;

export interface PopularRow {
  readonly name: string;
  readonly soldCount: number;
}

/**
 * Sales rows onto live menu items, in sales order.
 *
 * The join direction is the whole point. Defect C4 in its original form is
 * "Popular Items lists dishes that are not on this menu" — and a sales table
 * is exactly how that comes back, because `order_lines.name_snapshot` records
 * what a guest was charged for months ago rather than what the kitchen makes
 * today. Starting from the sales rows and *looking each one up in the current
 * menu* means a delisted dish has nowhere to land. Starting from the menu and
 * annotating it with sales would have read the same and failed differently.
 *
 * An unavailable item is dropped for a different reason: recommending a dish
 * the kitchen has switched off is a promise the floor cannot keep.
 */
export function matchPopular(
  menu: PublicMenu,
  rows: readonly PopularRow[],
): readonly PublicMenuItem[] {
  const byName = new Map(menu.items.map((item) => [item.name, item]));
  const picked: PublicMenuItem[] = [];
  for (const row of rows) {
    const item = byName.get(row.name);
    if (item === undefined || !item.isAvailable) continue;
    if (picked.some((existing) => existing.id === item.id)) continue;
    picked.push(item);
    if (picked.length === POPULAR_LIMIT) break;
  }
  return picked;
}
