'use client';

import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PublicMenu, PublicMenuItem } from '@natech/contracts';
import { usePick } from './i18n';
import { CartBar, CartBarSpacer } from './CartBar';
import { MenuRow } from './MenuRow';
import { MenuToolbar } from './MenuToolbar';
import { OrderPanel } from './OrderPanel';
import { PopularRail } from './PopularRail';

/**
 * The menu — BUILD-PLAN.md §13.1, §13.2, §19;
 * docs/runfiles/M22-storefront-layout.md.
 *
 * M22 recomposed this around three pieces it used to inline: `MenuToolbar`
 * (one sticky bar carrying search and the category tabs, replacing two
 * competing navigations), `MenuRow` (list rows instead of a photo grid, which
 * roughly doubles what a viewport holds while giving each dish more readable
 * width), and `OrderPanel` (the desktop right column, which was empty space).
 *
 * What did not change is the part that was already right: the filter is applied
 * once, and both the category list and every count derive from the *filtered*
 * set (R16). A tab reading "Burgers 6" above three visible burgers is the same
 * defect as a table header disagreeing with its own rows.
 */
export interface MenuBrowserProps {
  readonly menu: PublicMenu;
  readonly popular?: readonly PublicMenuItem[];
  readonly query?: string;
}

export function MenuBrowser({ menu, popular = [], query = '' }: MenuBrowserProps) {
  const t = useTranslations();
  const pick = usePick();

  const needle = query.trim().toLocaleLowerCase();
  const visibleItems =
    needle === ''
      ? menu.items
      : menu.items.filter((item) =>
          [item.name, item.nameUr, item.description, item.descriptionUr]
            .filter((value): value is string => value !== null)
            .some((value) => value.toLocaleLowerCase().includes(needle)),
        );
  const categories = menu.categories.filter((category) =>
    visibleItems.some((item) => item.categorySlug === category.slug),
  );

  return (
    <div>
      <MenuToolbar
        query={query}
        categories={categories.map((category) => ({
          slug: category.slug,
          label: pick(category.name, category.nameUr),
          count: visibleItems.filter((item) => item.categorySlug === category.slug).length,
        }))}
      />

      <div
        id="menu-sections"
        className="mx-auto grid max-w-[110rem] gap-8 px-4 py-8 md:px-8 lg:grid-cols-[minmax(0,1fr)_22rem]"
      >
        <div className="min-w-0">
          {/* Only on the unfiltered menu. A shortlist of favourites above a set
              of search results answers a question nobody asked. */}
          {needle === '' && <PopularRail items={popular} />}

          {needle !== '' && (
            <h2 className="font-display mb-6 text-2xl font-bold">
              {t('menu.resultsFor', { query: query.trim() })}
            </h2>
          )}

          {/* A search that matches nothing used to render the heading above and
              then an empty page — no explanation and no way back to the full
              menu but the browser's own back button. */}
          {categories.length === 0 && (
            <div className="border-store-line bg-store-surface rounded-2xl border px-6 py-16 text-center">
              <SearchX aria-hidden="true" className="text-store-muted mx-auto mb-3 size-8" />
              <p className="font-display text-lg font-bold">
                {t('menu.noResults', { query: query.trim() })}
              </p>
              <p className="text-store-muted mx-auto mt-1 max-w-sm text-sm">
                {t('menu.noResultsHelp')}
              </p>
              <Link
                href="/menu"
                className="bg-store-accent min-h-touch mt-6 inline-flex items-center rounded-full px-6 text-sm font-bold text-white"
              >
                {t('menu.clearSearch')}
              </Link>
            </div>
          )}

          <div className="space-y-10">
            {categories.map((category) => {
              const items = visibleItems.filter((item) => item.categorySlug === category.slug);
              return (
                <section key={category.id} id={`c-${category.slug}`} className="scroll-mt-40">
                  <div className="mb-4">
                    <h2 className="font-display text-2xl font-bold">
                      {pick(category.name, category.nameUr)}
                    </h2>
                    <p className="text-store-muted mt-0.5 text-sm">
                      {t('menu.itemsAvailable', { count: items.length })}
                    </p>
                  </div>
                  <ul className="grid gap-3 xl:grid-cols-2">
                    {items.map((item) => (
                      <li key={item.id} className="flex">
                        <div className="w-full">
                          <MenuRow item={item} categorySlug={category.slug} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>

        <OrderPanel />
      </div>

      <CartBarSpacer />
      <CartBar />
    </div>
  );
}
