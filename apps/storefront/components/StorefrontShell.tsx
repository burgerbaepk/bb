'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Clock,
  Compass,
  Home,
  Languages,
  Mail,
  MapPin,
  Navigation,
  Phone,
  ShoppingBag,
  Star,
  UserRound,
  UtensilsCrossed,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ComponentType, ReactNode } from 'react';
import type { OutletProfile } from '@/lib/outlet';
import { formatOpeningHours } from '@/lib/hours';
import { formatRating, GoogleRating } from './GoogleRating';
import { usePick, useLocaleSwitch } from './i18n';
import { useCart } from './CartProvider';

/** A footer link to a menu section. Name and slug only — see `FooterCategories` for why there is no count. */
export interface ShellCategory {
  readonly slug: string;
  readonly name: string;
  readonly nameUr: string | null;
}

function mapsHref(outlet: OutletProfile): string | null {
  if (outlet.latitude !== null && outlet.longitude !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${outlet.latitude},${outlet.longitude}`;
  }
  if (outlet.address === '') return null;
  const where = [outlet.address, outlet.city].filter((part) => part !== '').join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}`;
}

export function StorefrontShell({
  tradingName,
  logoUrl = '/images/burger-bae-icon.png',
  tagline = '',
  signedIn = false,
  outlet,
  categories = [],
  reviewUrl = null,
  reviewQr = null,
  children,
}: {
  readonly tradingName: string;
  readonly logoUrl?: string;
  readonly tagline?: string;
  readonly signedIn?: boolean;
  readonly outlet?: OutletProfile;
  readonly categories?: readonly ShellCategory[];
  /** Google review link and its QR, both resolved on the server — see `lib/googleReview.ts`. */
  readonly reviewUrl?: string | null;
  readonly reviewQr?: string | null;
  readonly children: ReactNode;
}) {
  const t = useTranslations();
  const pick = usePick();
  const { toggle } = useLocaleSwitch();
  const cart = useCart();
  const pathname = usePathname();
  const name = tradingName === '' ? t('shell.unbranded') : tradingName;
  const city = outlet?.city ?? '';
  const directions = outlet ? mapsHref(outlet) : null;
  const offDays = outlet?.weeklyOffDays ?? [];
  const hours = formatOpeningHours(outlet?.storeOpen ?? null, outlet?.storeClose ?? null);
  // Most single-outlet deployments trade under their registered name, and
  // printing it a second line below an identical heading reads as a rendering
  // fault rather than as a legal detail.
  const legalName =
    outlet && outlet.legalName !== '' && outlet.legalName !== name ? outlet.legalName : null;

  // M22 — the header carries identity and account actions only. Search moved
  // into `MenuToolbar`, beside the categories it filters and pre-filled with
  // the current query, because two search boxes posting to the same `/menu?q=`
  // is the duplicate-navigation problem this milestone set out to remove.
  //
  // The destinations are a list rather than repeated markup so that the active
  // one is decided once. A customer who cannot tell which page they are on
  // taps the link they are already on, which reads to them as a broken site;
  // `aria-current` is the same statement made to a screen reader.
  const destinations: readonly {
    href: string;
    label: string;
    Icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  }[] = [
    { href: '/', label: t('nav.home'), Icon: Home },
    { href: '/menu', label: t('nav.menu'), Icon: UtensilsCrossed },
  ];
  const isCurrent = (href: string): boolean =>
    href === '/' ? pathname === '/' : (pathname?.startsWith(href) ?? false);

  return (
    <div className="storefront-canvas flex min-h-dvh flex-col">
      <header className="storefront-header border-store-line bg-store-canvas/95 sticky top-0 z-40 border-b backdrop-blur-md">
        <div className="mx-auto flex max-w-[110rem] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 md:px-8">
          <Link href="/" className="order-1 flex min-w-0 items-center gap-3 rounded-md">
            <Image
              src={logoUrl}
              alt=""
              width={56}
              height={56}
              className="size-12 shrink-0 object-contain sm:size-14"
              preload
            />
            <span className="min-w-0">
              <span className="block truncate font-display text-base font-bold">{name}</span>
              {tagline && (
                <span className="text-store-muted block truncate text-xs">{tagline}</span>
              )}
            </span>
          </Link>
          <nav
            aria-label={t('nav.main')}
            className="order-2 ms-auto flex flex-wrap items-center gap-1"
          >
            {destinations.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                className="store-icon-link"
                aria-current={isCurrent(href) ? 'page' : undefined}
              >
                <Icon aria-hidden={true} className="size-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
            <button
              type="button"
              onClick={toggle}
              className="store-icon-link"
              aria-label={t('nav.language')}
            >
              <Languages aria-hidden="true" className="size-4" />
              <span className="hidden lg:inline">{t('nav.language')}</span>
            </button>
            {/* One account entry point, not two. `/login` renders the sign-in
                and sign-up tabs together (`CheckoutFlow`'s `accountMode`), so a
                second header link only cost width on the phone where the whole
                nav was wrapping onto a second row. */}
            {!signedIn && (
              <Link href="/login" className="store-icon-link" aria-label={t('checkout.signIn')}>
                <UserRound aria-hidden="true" className="size-4" />
                <span className="hidden lg:inline">{t('checkout.signIn')}</span>
              </Link>
            )}
            {/* The cart is the one action the whole site exists for, so it is
                the one filled control in the header — everything else beside it
                is quiet by comparison. The count is inside the accessible name
                rather than beside it, so a screen reader announces "Cart, 3
                items" instead of reading a bare numeral after the label. */}
            <Link
              href="/checkout"
              className="store-nav-cta"
              aria-label={
                cart.itemCount === 0
                  ? t('nav.cart')
                  : `${t('nav.cart')}, ${t('cart.itemCount', { count: cart.itemCount })}`
              }
            >
              <ShoppingBag aria-hidden="true" className="size-4" />
              <span className="hidden sm:inline">{t('nav.cart')}</span>
              {cart.itemCount > 0 && (
                <span aria-hidden="true" className="store-nav-badge">
                  {cart.itemCount}
                </span>
              )}
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>

      {/*
       * The footer — §13.5.
       *
       * It carried a name, an address and an opening time, which on a public
       * storefront is a wasted screen: the footer is where a customer who has
       * scrolled the whole menu looks for how to actually reach the place, and
       * where a search engine looks for what this site is and where it serves.
       * Both now have something to read.
       *
       * Every word of it is `outlet_config` or a translated string with the
       * outlet's own town interpolated — never a literal (R12, `brand-grep`).
       * The same footer therefore describes the next deployment correctly
       * without an edit, which a hand-written "fast food in <town>" sentence
       * would not.
       */}
      <footer className="store-footer mt-14 text-white">
        {/* The band that asks for the order.
            A footer on a restaurant site is read by somebody who has just
            finished scrolling the menu, which makes it the second-best place on
            the page to put the buttons — and the phone number belongs beside
            them, because a customer who has decided what they want is as likely
            to ring as to tap. */}
        <div className="border-b border-white/10">
          <div className="mx-auto flex max-w-[110rem] flex-col gap-6 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-8">
            <div className="min-w-0">
              <p className="font-display text-2xl font-bold md:text-3xl">{t('footer.ctaTitle')}</p>
              <p className="mt-2 max-w-xl text-sm text-white/70">
                {city === '' ? t('footer.ctaHelp') : t('footer.serving', { city })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/menu" className="store-footer-cta">
                <UtensilsCrossed aria-hidden="true" className="size-4" />
                {t('landing.viewMenu')}
              </Link>
              {outlet?.phone && (
                <a href={`tel:${outlet.phone}`} className="store-footer-ghost">
                  <Phone aria-hidden="true" className="size-4" />
                  {t('footer.callToOrder')}
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="mx-auto grid max-w-[110rem] gap-x-10 gap-y-10 px-4 py-12 sm:grid-cols-2 md:px-8 lg:grid-cols-[1.4fr_0.8fr_1.1fr_1.2fr]">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 p-1.5">
                <Image
                  src={logoUrl}
                  alt=""
                  width={56}
                  height={56}
                  className="size-full object-contain"
                />
              </span>
              <p className="font-display text-xl font-bold">{name}</p>
            </div>
            <p className="max-w-sm text-sm leading-relaxed text-white/75">
              {city === '' ? t('footer.about') : t('footer.aboutCity', { name, city })}
            </p>
            {legalName !== null && <p className="mt-4 text-xs text-white/55">{legalName}</p>}
          </div>

          <nav aria-labelledby="footer-explore">
            <h2 id="footer-explore" className="store-footer-heading">
              <span className="store-footer-chip">
                <Compass className="size-4" aria-hidden="true" />
              </span>
              {t('footer.explore')}
            </h2>
            <ul className="mt-3">
              <li>
                <Link href="/" className="store-footer-link">
                  {t('nav.home')}
                </Link>
              </li>
              <li>
                <Link href="/menu" className="store-footer-link">
                  {t('footer.fullMenu')}
                </Link>
              </li>
              <li>
                <Link href="/checkout" className="store-footer-link">
                  {t('nav.cart')}
                </Link>
              </li>
              {/* Sign-up lives here rather than in the header: the header's
                  account link goes to `/login`, which offers both tabs, and a
                  second account control up there was the thing pushing the nav
                  onto a second row on a phone. The word still exists on the
                  page for a first-time customer looking for it. */}
              {!signedIn && (
                <li>
                  <Link href="/signup" className="store-footer-link">
                    {t('checkout.signUp')}
                  </Link>
                </li>
              )}
            </ul>
          </nav>

          {/* Menu sections, and deliberately without counts.
              M22 removed the header's category strip because two navigations
              competing over the same job are worse than one; this is not that
              strip returning. It does not float, it does not filter, and it
              claims no figure a screen could contradict (R16) — it is a way
              into a section from the bottom of a long page, and the crawlable
              link a search engine needs to reach a category at all.

              Two columns, because eight categories in one file make a thin
              strip beside three short blocks and leave the footer looking
              half-loaded on a wide screen. */}
          {categories.length > 0 && (
            <nav aria-labelledby="footer-menu">
              <h2 id="footer-menu" className="store-footer-heading">
                <span className="store-footer-chip">
                  <UtensilsCrossed className="size-4" aria-hidden="true" />
                </span>
                {t('footer.onTheMenu')}
              </h2>
              <ul className="mt-3 grid grid-cols-2 gap-x-6">
                {categories.slice(0, 10).map((category) => (
                  <li key={category.slug}>
                    <Link href={`/menu#c-${category.slug}`} className="store-footer-link">
                      {pick(category.name, category.nameUr)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <div>
            <h2 className="store-footer-heading">
              <span className="store-footer-chip">
                <MapPin className="size-4" aria-hidden="true" />
              </span>
              {t('footer.findUs')}
            </h2>
            {outlet && outlet.address !== '' && (
              <address className="mt-3 text-sm leading-relaxed text-white/75 not-italic">
                {outlet.address}
                {outlet.city === '' ? '' : `, ${outlet.city}`}
              </address>
            )}
            {directions !== null && (
              <a
                href={directions}
                target="_blank"
                rel="noreferrer"
                className="store-footer-link gap-2"
              >
                <Navigation aria-hidden="true" className="size-4 shrink-0" />
                {t('footer.directions')}
              </a>
            )}

            <div className="mt-5 space-y-2 border-t border-white/10 pt-5">
              <p className="flex items-center gap-2.5 text-sm text-white/75">
                <Clock className="size-4 shrink-0" aria-hidden="true" />
                <span className="sr-only">{t('footer.hours')}: </span>
                <span className="tabular-nums">{hours ?? t('footer.hoursUnknown')}</span>
              </p>
              {offDays.length > 0 && (
                <p className="ps-[1.625rem] text-xs text-white/55">
                  {t('footer.closedOn', { days: offDays.join(', ') })}
                </p>
              )}
              {/* One contact per row. As two inline-flex links they sat on the
                  same line with nothing between them, so the phone number ran
                  straight into the email address as a single unreadable
                  string. */}
              {outlet?.phone && (
                <a
                  href={`tel:${outlet.phone}`}
                  className="store-footer-link flex gap-2.5 font-semibold text-white"
                >
                  <Phone aria-hidden="true" className="size-4 shrink-0" />
                  {outlet.phone}
                </a>
              )}
              {outlet?.email && (
                <a href={`mailto:${outlet.email}`} className="store-footer-link flex gap-2.5">
                  <Mail aria-hidden="true" className="size-4 shrink-0" />
                  <span className="break-all">{outlet.email}</span>
                </a>
              )}
            </div>

            {/* The review ask. A QR here is not decoration: it is the same code
                the counter prints, so a customer reading the site on a laptop
                can photograph it with the phone they would actually leave the
                review on. Rendered only when a place ID is configured — R12
                keeps the listing out of source, so an unconfigured deployment
                shows nothing rather than another outlet's listing. */}
            {reviewUrl !== null && (
              <div className="mt-5 border-t border-white/10 pt-5">
                <p className="text-sm font-semibold text-white">{t('footer.reviewTitle')}</p>
                <div className="mt-3 flex items-center gap-3">
                  {reviewQr !== null && (
                    <a
                      href={reviewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded-lg bg-white p-1.5"
                    >
                      <Image
                        src={reviewQr}
                        alt={t('footer.reviewQrAlt')}
                        width={76}
                        height={76}
                        unoptimized
                        className="size-[76px]"
                      />
                    </a>
                  )}
                  <div className="min-w-0 space-y-1.5">
                    {outlet?.googleRating != null && (
                      <GoogleRating
                        rating={outlet.googleRating}
                        count={outlet.googleReviewCount}
                        href={null}
                        label={t('footer.ratingLabel', {
                          rating: formatRating(outlet.googleRating),
                        })}
                        reviewsLabel={t('footer.reviewCount', {
                          count: outlet.googleReviewCount ?? 0,
                        })}
                      />
                    )}
                    <a
                      href={reviewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="store-footer-link gap-2 text-xs"
                    >
                      <Star aria-hidden="true" className="size-3.5 shrink-0" />
                      {t('footer.writeReview')}
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-white/15 px-4 py-5 text-center text-xs leading-relaxed text-white/60">
          © {new Date().getFullYear()} {name}. {t('footer.rights')}
        </div>
      </footer>
    </div>
  );
}
