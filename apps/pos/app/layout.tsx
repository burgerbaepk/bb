import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { brandCssVariables } from '@natech/branding';
import { readBrandConfig } from '@/lib/branding/queries';
import { ServiceWorkerRegister } from '@/components/shell/ServiceWorkerRegister';
import './globals.css';

/**
 * BUILD-PLAN.md §3 — the POS is noindex. It is a till, not a web page.
 * §14.3 — the brand name is never in source (R12). `BrandConfig` is resolved
 * from the `settings` row keyed `'branding'` (M08) — not `outlet_config`,
 * which is legal/fiscal identity (§5.1: NTN, STRN, address) and out of this
 * file's concern. `readBrandConfig()` runs on every request, so a rebrand
 * takes effect on the next navigation with no rebuild.
 *
 * `metadata.title` stays the static neutral string below rather than becoming
 * per-request: Next's static `metadata` export cannot read the database, and
 * moving to `generateMetadata()` for one string is more machinery than the
 * browser tab title earns here — the tab matters far less than the invoice
 * header, the receipt, and the storefront, which all take `BrandConfig` from
 * the database already.
 */

/**
 * P9 resolved — Mehr Nastaliq Web, CC BY-SA 4.0, self-hosted from the mehr
 * package. §15.1 makes the POS itself English-only; the face loads here so
 * that /_ds can exercise RTL and Urdu typography, which is an M01 gate.
 *
 * ADR 0020 — the Latin face is Geist, self-hosted from the `geist` package for
 * the same reason Mehr is: a build must not depend on reaching Google Fonts.
 * `GeistSans`/`GeistMono` bind `--font-geist-sans` and `--font-geist-mono`,
 * which the token layer reads only as the fallback behind `--brand-font-*`, so
 * an operator who names their own face in the branding editor still wins. What
 * it replaces is the previous default of "whatever the device has", which
 * rendered the same screen in SF Pro on the manager's Mac and Roboto on the
 * floor tablet.
 */
const urdu = localFont({
  src: '../node_modules/mehr/mehr.woff',
  display: 'swap',
  variable: '--brand-font-urdu',
});

export const metadata: Metadata = {
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
  title: 'POS Terminal',
  robots: { index: false, follow: false },
};

/**
 * R12 — `themeColor` is brand identity and is resolved per request, the same
 * way `brandCssVariables()` resolves everything else. A literal here shipped
 * one client's red to every deployment and no gate below the brand-grep would
 * have caught it in review.
 *
 * The colour is omitted when the brand row has none, so the browser keeps its
 * own chrome rather than being handed a wrong one.
 */
export async function generateViewport(): Promise<Viewport> {
  const brand = await readBrandConfig();
  return {
    ...(brand.theme.primary === '' ? {} : { themeColor: brand.theme.primary }),
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  };
}

// Branding is database-backed and resolved per request. Keep framework pages
// such as /_not-found from querying Neon during a secret-free CI build.
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const brand = await readBrandConfig();

  return (
    <html
      lang="en"
      className={`${urdu.variable} ${GeistSans.variable} ${GeistMono.variable}`}
      // `brandCssVariables` only emits `--brand-*` custom properties, which the
      // shipped `React.CSSProperties` type does not name — React itself places
      // no restriction on arbitrary custom properties in a style object.
      style={brandCssVariables(brand) as React.CSSProperties}
    >
      <body>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
