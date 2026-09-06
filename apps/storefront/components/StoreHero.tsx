import { Clock, MapPin, UtensilsCrossed } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import type { OutletProfile } from '@/lib/outlet';
import { formatOpeningHours } from '@/lib/hours';
import { googleReviewUrl } from '@/lib/googleReview';
import { formatRating, GoogleRating } from './GoogleRating';

import { BannerSlider } from './BannerSlider';

/**
 * The identity block — BUILD-PLAN.md §13.1, §13.5, §19;
 * docs/runfiles/M22-storefront-layout.md §2.
 *
 * M22 tightened this into the compact header the reference design uses: a
 * thumbnail, the name, and the two facts a customer checks before ordering —
 * whether it is open and where it is — on one line rather than stacked down
 * the page above the fold.
 *
 * Deliberately **without** the reference's cuisine tags, and for a long time
 * without its rating either: there is no reviews table anywhere in this
 * product and no review capture, so rendering `4.2/5 (500+)` would have put a
 * fabricated figure on a shipped surface — defect C4, and the class of thing
 * ADR 0025 removed from the admin settings screen. A star that means nothing
 * is worse than no star, because it teaches a customer that nothing else on
 * the page is checked either.
 *
 * The rating below does not break that rule, it satisfies it. It is not
 * computed from data this product does not have; it is the outlet's own Google
 * listing score, held in `outlet_config` and linked back to the listing it was
 * read from, so a customer can verify it at the source. It renders only when a
 * manager has entered one — an empty column draws nothing, never a zero.
 *
 * §13.5 — everything here is server-rendered from `outlet_config`, so a crawler
 * sees the same name, hours and address a customer does. R12: not one of these
 * values is hardcoded, which is also why there is no logo here. The sticky
 * header carries it directly above, and the only path to a second copy was a
 * literal asset filename — restaurant identity, which R12 keeps in
 * `outlet_config` and the seeds rather than in a component.
 */
export async function StoreHero({ outlet }: { readonly outlet: OutletProfile }) {
  const t = await getTranslations();
  const name = outlet.tradingName === '' ? t('shell.unbranded') : outlet.tradingName;
  const hours = formatOpeningHours(outlet.storeOpen, outlet.storeClose) ?? t('landing.hours');
  const reviewUrl = googleReviewUrl(outlet);

  return (
    <>
      <BannerSlider name={name} />
      <section className="bg-store-surface text-store-ink" aria-labelledby="store-hero-title">
        <div className="mx-auto max-w-[110rem] px-4 py-6 md:px-8">
          <div className="min-w-0">
            <h1 id="store-hero-title" className="font-display text-2xl font-bold md:text-4xl">
              {name}
            </h1>
            <p className="text-store-muted mt-1.5 text-sm md:text-base">
              {t('landing.orderAtTable')}
            </p>

            {outlet.googleRating !== null && (
              <div className="mt-2.5">
                <GoogleRating
                  rating={outlet.googleRating}
                  count={outlet.googleReviewCount}
                  href={reviewUrl}
                  tone="light"
                  label={t('footer.ratingLabel', { rating: formatRating(outlet.googleRating) })}
                  reviewsLabel={t('footer.reviewCount', {
                    count: outlet.googleReviewCount ?? 0,
                  })}
                />
              </div>
            )}

            <dl className="text-store-muted mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Clock aria-hidden="true" className="size-4 shrink-0" />
                <dt className="sr-only">{t('footer.hours')}</dt>
                <dd className="tabular-nums">{hours}</dd>
              </div>
              {outlet.address !== '' && (
                <div className="flex items-center gap-2">
                  <MapPin aria-hidden="true" className="size-4 shrink-0" />
                  <dt className="sr-only">{name}</dt>
                  <dd>
                    {outlet.address}
                    {outlet.city === '' ? '' : `, ${outlet.city}`}
                  </dd>
                </div>
              )}
            </dl>

            {/* An in-page anchor rather than a route: the menu is directly below
                on this page, and sending a customer to /menu for it would be a
                navigation that lands them where they already were. */}
            <a
              href="#menu-sections"
              className="bg-store-accent min-h-touch mt-4 inline-flex items-center gap-2 rounded-full px-6 text-sm font-bold text-white shadow-lg transition-transform hover:scale-[1.02]"
            >
              <UtensilsCrossed aria-hidden="true" className="size-4" />
              {t('landing.viewMenu')}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
