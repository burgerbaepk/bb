'use client';

import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

/**
 * One sticky bar for finding things — BUILD-PLAN.md §13.2, §19;
 * docs/runfiles/M22-storefront-layout.md §1, §3.
 *
 * Categories used to appear twice: a strip in `StorefrontShell`'s header and a
 * pill row inside `MenuBrowser`. Two navigation systems for one job are worse
 * than one, because neither is trusted and each has to be scanned before the
 * other is dismissed. This is the survivor, and the shell's strip is gone.
 *
 * The in-page row is the one that survived rather than the header's, for an
 * R16 reason: only this one knows the per-category counts of the *filtered*
 * set. A summary is a function of the rows being rendered, and a tab claiming
 * "Burgers 6" above three visible burgers is the same defect as a table header
 * disagreeing with its own list.
 *
 * Sticky, because the alternative on a forty-item menu is scrolling back to
 * the top to change section, and offset by the header so the two do not
 * overlap.
 */
export interface MenuToolbarProps {
  readonly categories: readonly {
    readonly slug: string;
    readonly label: string;
    readonly count: number;
  }[];
  readonly query: string;
}

export function MenuToolbar({ categories, query }: MenuToolbarProps) {
  const t = useTranslations();

  return (
    <div className="border-store-line bg-store-canvas/95 sticky top-[var(--store-header-h)] z-30 border-b backdrop-blur-md">
      <div className="mx-auto flex max-w-[110rem] flex-col gap-2 px-4 py-2.5 md:flex-row md:items-center md:gap-4 md:px-8">
        {/* A GET form, so a search works with JavaScript still loading and the
            result is a URL somebody can share or reload. §13.5 wants the menu
            server-rendered; this keeps the filtered menu server-rendered too. */}
        <form action="/menu" method="get" role="search" className="shrink-0 md:w-72">
          <label htmlFor="menu-search" className="sr-only">
            {t('nav.searchLabel')}
          </label>
          <div className="border-store-line bg-store-surface has-[:focus]:border-store-accent has-[:focus]:ring-store-accent/15 flex h-11 items-center gap-2 rounded-full border px-4 transition-shadow has-[:focus]:ring-4">
            <Search aria-hidden="true" className="text-store-muted size-4 shrink-0" />
            <input
              id="menu-search"
              name="q"
              type="search"
              defaultValue={query}
              placeholder={t('menu.searchInMenu')}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
            {query !== '' && (
              <Link
                href="/menu"
                className="text-store-muted hover:text-store-ink shrink-0"
                aria-label={t('menu.clearSearch')}
              >
                <X aria-hidden="true" className="size-4" />
              </Link>
            )}
          </div>
        </form>

        {categories.length > 0 && (
          <nav aria-label={t('menu.jumpTo')} className="min-w-0 flex-1">
            <ul className="flex gap-1.5 overflow-x-auto py-0.5">
              {categories.map((category) => (
                <li key={category.slug}>
                  <a
                    href={`#c-${category.slug}`}
                    className="text-store-muted hover:bg-store-sunken hover:text-store-ink inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors"
                  >
                    {category.label}
                    <span className="text-store-muted/70 text-xs tabular-nums">
                      {category.count}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}
