import type { Metadata } from 'next';
import type { SeoSettings } from '@natech/branding';
import type { OutletProfile } from '../outlet';

export interface StoreSeo {
  name: string;
  city: string;
  title: string;
  description: string;
  keywords: string[];
  baseUrl: string;
  image: string;
  logo: string;
  tagline: string;
  verification: string;
  indexable: boolean;
}

export function publicOrigin(value: string): string {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? url.origin
      : '';
  } catch {
    return '';
  }
}

export function localImage(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const path = value.startsWith('/') ? value : `/images/${value}`;
  return /^\/images\/[a-zA-Z0-9/_-]+\.(png|jpe?g|webp|avif)$/.test(path) ? path : fallback;
}

export function resolveStoreSeo(
  outlet: OutletProfile,
  branding: { logoLight?: string | undefined; tagline?: string | undefined },
  settings: SeoSettings,
  categoryNames: string[],
  configuredUrl: string,
  indexable: boolean,
): StoreSeo {
  const name = outlet.tradingName || 'Restaurant';
  const location = outlet.city ? ` in ${outlet.city}` : '';
  const categories = categoryNames.slice(0, 5).join(', ');
  return {
    name,
    city: outlet.city,
    title: settings.title || `${name}${location} | Order Online`,
    description:
      settings.description ||
      `Order fast food online from ${name}${location}. ${categories ? `Explore ${categories.toLowerCase()}. ` : ''}${branding.tagline ? `${branding.tagline}. ` : ''}Browse the menu and prices.`,
    // The generic terms are what a hungry customer actually types, and no
    // deployment would ever think to enter them by hand. The outlet's own town
    // is interpolated rather than written down — R12, and the next deployment
    // gets its own town for free. Anything the client does set in the SEO
    // settings row replaces the lot, deliberately: an explicit list is a
    // decision, and a decision is not to be quietly appended to.
    keywords: settings.keywords
      ? settings.keywords
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
      : [
          name,
          outlet.city,
          outlet.city ? `fast food in ${outlet.city}` : '',
          outlet.city ? `${outlet.city} home delivery` : '',
          'fast food',
          'burgers',
          'takeaway',
          'food delivery',
          ...categoryNames,
          'order online',
        ].filter(Boolean),
    baseUrl: publicOrigin(settings.siteUrl || configuredUrl),
    image: settings.socialImage || '/images/burger-bae-hero.jpg',
    logo: localImage(branding.logoLight, '/images/burger-bae-logo.png'),
    tagline: branding.tagline || '',
    verification: settings.googleVerification,
    indexable,
  };
}

export function pageMetadata(
  seo: StoreSeo,
  page: {
    title?: string;
    description?: string;
    path?: string;
    image?: string;
    noindex?: boolean;
  } = {},
): Metadata {
  const title = page.title ? `${page.title} | ${seo.name}` : seo.title;
  const description = page.description || seo.description;
  const url = seo.baseUrl ? new URL(page.path || '/', seo.baseUrl).href : undefined;
  const image = page.image || seo.image;
  const imageUrl = seo.baseUrl ? new URL(image, seo.baseUrl).href : image;
  return {
    title: { absolute: title },
    description,
    metadataBase: seo.baseUrl ? new URL(seo.baseUrl) : undefined,
    applicationName: seo.name,
    keywords: seo.keywords,
    alternates: url ? { canonical: url } : undefined,
    robots: { index: seo.indexable && !page.noindex, follow: true },
    openGraph: {
      type: 'website',
      siteName: seo.name,
      title,
      description,
      url,
      locale: 'en_PK',
      images: [{ url: imageUrl, alt: page.title || seo.name }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [imageUrl] },
    verification: seo.verification ? { google: seo.verification } : undefined,
  };
}
