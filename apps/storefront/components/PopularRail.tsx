'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Flame, UtensilsCrossed } from 'lucide-react';
import { Money } from '@natech/ui';
import { useTranslations } from 'next-intl';
import type { PublicMenuItem } from '@natech/contracts';
import { usePick } from './i18n';

/**
 * "Most ordered" — BUILD-PLAN.md §13.1, §2 R16, defect C4;
 * docs/runfiles/M22-storefront-layout.md §3.
 *
 * The one place on this page where a photograph earns its space: six items,
 * chosen for the customer, where the picture *is* the argument. The rest of
 * the menu is rows, and the two treatments are not inconsistent — a card is
 * right when there are six and the photo persuades, a row is right when there
 * are forty and the name and price are what somebody is scanning for.
 *
 * Every dish here was actually ordered. There is no curation flag on
 * `menu_items` and no hand-written list behind this: `readPopularItems` counts
 * finalized invoices and `matchPopular` refuses any name without a live,
 * available menu item behind it. The component renders nothing on an empty
 * list — the caller is expected to pass one — because "Most ordered" above a
 * filler row is precisely defect C4, which is a "Popular Items" panel listing
 * dishes that are not on the menu.
 */
export function PopularRail({ items }: { readonly items: readonly PublicMenuItem[] }) {
  const t = useTranslations();
  const pick = usePick();
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="popular-heading" className="mb-10">
      <div className="mb-1 flex items-center gap-2">
        <Flame aria-hidden="true" className="text-store-accent size-5" />
        <h2 id="popular-heading" className="font-display text-2xl font-bold">
          {t('menu.popular')}
        </h2>
      </div>
      <p className="text-store-muted mb-4 text-sm">{t('menu.popularHelp')}</p>

      {/* A scroller rather than a wrapping grid: this is a shortlist, and a
          shortlist that reflows into three ragged rows stops reading as one. */}
      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:-mx-8 md:px-8">
        {items.map((item) => {
          const name = pick(item.name, item.nameUr);
          return (
            <li key={item.id} className="w-40 shrink-0 snap-start sm:w-48">
              <Link
                href={`/menu/${item.categorySlug}/${item.slug}`}
                className="group border-store-line bg-store-surface hover:border-store-accent/60 block overflow-hidden rounded-2xl border transition-colors"
              >
                <div className="store-product-media relative aspect-square overflow-hidden">
                  {item.imageUrl === null ? (
                    <span className="flex size-full items-center justify-center">
                      <UtensilsCrossed
                        aria-hidden="true"
                        className="text-store-accent/35 size-10"
                      />
                    </span>
                  ) : (
                    <Image
                      src={item.imageUrl}
                      alt=""
                      fill
                      sizes="(min-width: 640px) 12rem, 10rem"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  )}
                </div>
                <div className="p-3">
                  <h3 className="font-display line-clamp-2 text-sm leading-snug font-bold">
                    {name}
                  </h3>
                  <p className="mt-1.5">
                    <Money value={item.priceExTax} trimWholeRupees emphasis="strong" />
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
