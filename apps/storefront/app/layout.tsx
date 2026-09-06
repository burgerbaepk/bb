import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { CartProvider } from '@/components/CartProvider';
import { StorefrontShell } from '@/components/StorefrontShell';
import { readOutletProfile } from '@/lib/outlet';
import { googleReviewUrl } from '@/lib/googleReview';
import { googleReviewQr } from '@/lib/googleReviewQr';
import { currentCustomerSession } from '@/lib/auth/session';
import { readStoreSeo } from '@/lib/seo/queries';
import { readPublicMenu } from '@/lib/menu/queries';
import { readBrandChrome } from '@/lib/branding';
import { pageMetadata } from '@/lib/seo/metadata';
import './globals.css';

/**
 * BUILD-PLAN.md §13, §15.1, R12; docs/runfiles/M14-storefront.md.
 *
 * The storefront is the only indexable surface in the product. `tradingName`
 * comes from `outlet_config` at request time — R12 bans a hardcoded one in
 * source — and the cart is hydrated from a returning customer's own
 * `web_sessions.cart` row when a session cookie is present.
 *
 * P9 resolved — Mehr Nastaliq Web, CC BY-SA 4.0, self-hosted. This is the
 * surface the face matters most on: §15.1 gives the storefront full
 * localisation with `dir="rtl"`, unlike the till and the back office.
 *
 * `lang`/`dir` are resolved server-side from `getLocale()` (`i18n/request.ts`
 * reads the same cookie), not flipped client-side after hydration — first
 * paint is correct in either language, the gap M06's own `LocaleProvider`
 * disclosed and named M15 as its fix.
 */
const urdu = localFont({
  src: '../node_modules/mehr/mehr.woff',
  display: 'swap',
  variable: '--brand-font-urdu',
});

/**
 * ADR 0020 — the Latin face, self-hosted for the same reason Mehr is. The
 * storefront injects no `--brand-*` properties of its own, so here Geist is
 * simply what the token layer resolves to.
 */

/** `metadataBase` resolves every route's relative OG/canonical URL — unset, Next falls back to `localhost:3000`, wrong for anything but a dev build. */
export async function generateMetadata(): Promise<Metadata> {
  const seo = await readStoreSeo();
  return {
    ...pageMetadata(seo),
    manifest: '/manifest.webmanifest',
    icons: {
      icon: [
        { url: '/favicon.ico' },
        { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
        { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
        { url: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
      ],
      shortcut: '/favicon.ico',
      apple: [{ url: '/apple-icon-180x180.png', sizes: '180x180', type: 'image/png' }],
    },
    other: { 'msapplication-config': '/browserconfig.xml' },
  };
}

/**
 * R12 — brand identity, resolved per request rather than written into source.
 * A literal here tinted every deployment's address bar with one client's red.
 * Omitted when the brand row has no theme, so the browser keeps its own chrome
 * rather than being handed the wrong one.
 */
export async function generateViewport(): Promise<Viewport> {
  const chrome = await readBrandChrome();
  return chrome.themeColor === null ? {} : { themeColor: chrome.themeColor };
}

// The shell reads the live outlet and the request's customer session. It no
// longer reads the menu: M22 moved the category navigation into `MenuToolbar`,
// which is the only one of the two that knows the counts of the filtered set.
// Prevent Next from evaluating those runtime dependencies while prerendering
// framework pages such as /_not-found during a secret-free CI build.
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [outlet, session, locale, messages, seo, menu] = await Promise.all([
    readOutletProfile(),
    currentCustomerSession(),
    getLocale(),
    getMessages(),
    readStoreSeo(),
    // Free: `readPublicMenu` is `cache()`d and `readStoreSeo` above already
    // awaited it in this same request, for the keywords it derives from the
    // category names. The footer needs the slugs the same read already has.
    readPublicMenu(),
  ]);

  // The QR is a server concern: `qrcode` is a Node dependency and the data URL
  // is identical on every route, so it is generated once here rather than
  // shipped as a client-side renderer in the footer.
  const reviewUrl = googleReviewUrl(outlet);
  const reviewQr = reviewUrl === null ? null : await googleReviewQr(reviewUrl);

  return (
    <html
      lang={locale}
      dir={locale === 'ur' ? 'rtl' : 'ltr'}
      className={`${urdu.variable} ${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <CartProvider initialCart={session?.cart ?? null}>
            <StorefrontShell
              tradingName={outlet.tradingName}
              signedIn={session !== null}
              tagline={seo.tagline}
              outlet={outlet}
              categories={menu.categories}
              reviewUrl={reviewUrl}
              reviewQr={reviewQr}
            >
              {children}
            </StorefrontShell>
          </CartProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
