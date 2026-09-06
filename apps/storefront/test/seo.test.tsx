import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { parseSeoSettings, SeoSettingsSchema } from '@natech/branding';
import { MOCK_PUBLIC_MENU } from '@natech/contracts/mocks';
import { pageMetadata, resolveStoreSeo } from '@/lib/seo/metadata';
import { buildRestaurantJsonLd } from '@/lib/seo/jsonld';
import { JsonLd } from '@/components/JsonLd';
import type { OutletProfile } from '@/lib/outlet';

const outlet: OutletProfile = {
  tradingName: 'Test Burger',
  legalName: 'Test Restaurant',
  city: 'Test City',
  address: 'Test Street',
  phone: '12345',
  email: null,
  timezone: 'Asia/Karachi',
  latitude: null,
  longitude: null,
  storeOpen: '12:00',
  storeClose: '23:00',
  weeklyOffDays: ['Monday'],
  googlePlaceId: null,
  googleRating: null,
  googleReviewCount: null,
};
const makeSeo = (values: unknown = {}) =>
  resolveStoreSeo(
    outlet,
    { logoLight: '/images/burger-bae-logo.png', tagline: 'Freshly made' },
    parseSeoSettings(values),
    ['Burgers', 'Pizza'],
    'https://test.example',
    true,
  );

describe('backend-driven storefront metadata', () => {
  it('fills default titles, descriptions and keywords from outlet and menu data', () => {
    const seo = makeSeo();
    expect(seo.title).toBe('Test Burger in Test City | Order Online');
    expect(seo.description).toContain('burgers, pizza');
    expect(seo.keywords).toContain('Test City');
    const metadata = pageMetadata(seo);
    expect(metadata.alternates?.canonical).toBe('https://test.example/');
    expect(metadata.openGraph?.title).toBe(seo.title);
    expect(metadata.twitter?.description).toBe(seo.description);
  });

  it('applies saved overrides consistently to canonical and social tags', () => {
    const seo = makeSeo({
      title: 'Custom title',
      description: 'Custom description',
      siteUrl: 'https://new.example',
      keywords: 'burgers, delivery',
      googleVerification: 'verification-code',
    });
    const metadata = pageMetadata(seo, { title: 'Menu', path: '/menu' });
    expect(metadata.title).toEqual({ absolute: 'Menu | Test Burger' });
    expect(metadata.description).toBe('Custom description');
    expect(metadata.alternates?.canonical).toBe('https://new.example/menu');
    expect(metadata.verification?.google).toBe('verification-code');
  });

  it('keeps search pages and development pages out of search indexes', () => {
    expect(pageMetadata(makeSeo(), { noindex: true }).robots).toEqual({
      index: false,
      follow: true,
    });
    expect(pageMetadata({ ...makeSeo(), indexable: false }).robots).toEqual({
      index: false,
      follow: true,
    });
  });

  it('rejects invalid origins and unsafe image paths', () => {
    expect(SeoSettingsSchema.safeParse({ siteUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(SeoSettingsSchema.safeParse({ siteUrl: 'https://test.example/menu' }).success).toBe(
      false,
    );
    expect(SeoSettingsSchema.safeParse({ socialImage: '/images/../private.png' }).success).toBe(
      false,
    );
  });

  it('includes live variant prices, branding and actual opening days in structured data', () => {
    const graph = buildRestaurantJsonLd(
      outlet,
      MOCK_PUBLIC_MENU,
      'https://test.example',
      makeSeo(),
    );
    expect(graph['logo']).toBe('https://test.example/images/burger-bae-logo.png');
    expect(JSON.stringify(graph['openingHoursSpecification'])).not.toContain('Monday');
    expect(JSON.stringify(graph['openingHoursSpecification'])).toContain('Tuesday');
    const item = MOCK_PUBLIC_MENU.items.find((entry) => entry.variants.length > 0);
    expect(item).toBeDefined();
    for (const variant of item?.variants ?? [])
      expect(JSON.stringify(graph)).toContain(variant.name);
  });

  it('preserves backend text while preventing script termination in JSON-LD', () => {
    const data = { name: '</script><script>alert(1)</script>' };
    const { container } = render(<JsonLd data={data} />);
    expect(container.querySelectorAll('script')).toHaveLength(1);
    const text = container.querySelector('script')?.textContent ?? '';
    expect(text).not.toContain('</script>');
    expect(JSON.parse(text)).toEqual(data);
  });
});
