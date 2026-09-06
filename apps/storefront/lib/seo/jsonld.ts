import type { StoreSeo } from './metadata';
import type { Paisa } from '@natech/domain';
import type { PublicMenu, PublicMenuItem } from '@natech/contracts';
import type { OutletProfile } from '../outlet';

/**
 * JSON-LD — BUILD-PLAN.md §13.5; docs/runfiles/M14-storefront.md.
 *
 * `offers.price` is a plain decimal string, not the fiscal payload — this
 * deliberately does not reuse `toFiscalDecimal()` (R1's own text reserves
 * that name for the transmission boundary specifically). Integer arithmetic
 * throughout for the same reason every other money conversion in this
 * codebase avoids a float: paisa divided and remaindered, never `/100` as a
 * `number`.
 */
function priceString(value: Paisa): string {
  const rupees = value / 100n;
  const paise = value % 100n;
  return `${rupees}.${paise.toString().padStart(2, '0')}`;
}

function menuItemNode(item: PublicMenuItem): Record<string, unknown> {
  return {
    '@type': 'MenuItem',
    name: item.name,
    ...(item.description !== null ? { description: item.description } : {}),
    ...(item.imageUrl ? { image: item.imageUrl } : {}),
    offers:
      item.variants.length > 0
        ? item.variants.map((variant) => ({
            '@type': 'Offer',
            name: variant.name,
            price: priceString(variant.priceExTax),
            priceCurrency: 'PKR',
            availability: item.isAvailable
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
          }))
        : {
            '@type': 'Offer',
            price: priceString(item.priceExTax),
            priceCurrency: 'PKR',
            availability: item.isAvailable
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
          },
  };
}

/** The restaurant graph — `Restaurant`, its `Menu`/`MenuSection`/`MenuItem`s, and `LocalBusiness` geo/hours, all from `outlet_config` and the live menu (R12 — never a hardcoded identity). */
export function buildRestaurantJsonLd(
  outlet: OutletProfile,
  menu: PublicMenu,
  siteUrl: string,
  seo?: StoreSeo,
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: outlet.tradingName,
    ...(siteUrl ? { url: siteUrl, '@id': `${siteUrl}/#restaurant` } : {}),
    ...(seo
      ? {
          description: seo.description,
          logo: siteUrl ? new URL(seo.logo, siteUrl).href : seo.logo,
          image: siteUrl ? new URL(seo.image, siteUrl).href : seo.image,
        }
      : {}),
    ...(outlet.email ? { email: outlet.email } : {}),
    telephone: outlet.phone,
    address: {
      '@type': 'PostalAddress',
      streetAddress: outlet.address,
      addressLocality: outlet.city,
      addressCountry: 'PK',
    },
    ...(outlet.latitude !== null && outlet.longitude !== null
      ? {
          geo: {
            '@type': 'GeoCoordinates',
            latitude: outlet.latitude,
            longitude: outlet.longitude,
          },
        }
      : {}),
    ...(outlet.storeOpen !== null && outlet.storeClose !== null
      ? {
          openingHoursSpecification: [
            {
              '@type': 'OpeningHoursSpecification',
              dayOfWeek: [
                'Monday',
                'Tuesday',
                'Wednesday',
                'Thursday',
                'Friday',
                'Saturday',
                'Sunday',
              ]
                .filter((day) => !outlet.weeklyOffDays?.includes(day))
                .map((day) => `https://schema.org/${day}`),
              opens: outlet.storeOpen,
              closes: outlet.storeClose,
            },
          ],
        }
      : {}),
    hasMenu: {
      '@type': 'Menu',
      ...(siteUrl ? { url: `${siteUrl}/menu` } : {}),
      hasMenuSection: menu.categories.map((category) => ({
        '@type': 'MenuSection',
        name: category.name,
        hasMenuItem: menu.items
          .filter((item) => item.categorySlug === category.slug)
          .map(menuItemNode),
      })),
    },
  };
}

/** A single item-detail page's own markup — one `MenuItem`, not the whole restaurant graph. */
export function buildMenuItemJsonLd(item: PublicMenuItem): Record<string, unknown> {
  return { '@context': 'https://schema.org', ...menuItemNode(item) };
}
