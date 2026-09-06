import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { axe, toHaveNoViolations } from 'jest-axe';
import { MOCK_OUTLET, MOCK_PUBLIC_MENU, MOCK_PUBLIC_ORDERS } from '@natech/contracts/mocks';
import en from '../messages/en.json';
import ur from '../messages/ur.json';
import { CartProvider } from '@/components/CartProvider';
import { StorefrontShell } from '@/components/StorefrontShell';
import { MenuBrowser } from '@/components/MenuBrowser';
import { CheckoutFlow } from '@/components/CheckoutFlow';
import { OrderStatus } from '@/components/OrderStatus';

expect.extend(toHaveNoViolations);

/**
 * M18 · performance-a11y — BUILD-PLAN.md §18/§19, `docs/runfiles/
 * M18-performance-a11y.md`. Both text directions, because the storefront is
 * the one app in this repository that actually renders `ur`/RTL (§15.1) —
 * `apps/pos/test/a11y.test.tsx` covers the till, LTR-only.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {} }),
  // `StorefrontShell` marks the current destination with it.
  usePathname: () => '/',
}));

function mockPasswordFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

type Locale = 'en' | 'ur';

function renderWithLocale(node: React.ReactNode, locale: Locale) {
  return render(
    <div dir={locale === 'ur' ? 'rtl' : 'ltr'}>
      <NextIntlClientProvider locale={locale} messages={locale === 'ur' ? ur : en}>
        <CartProvider>
          <StorefrontShell tradingName={MOCK_OUTLET.tradingName}>{node}</StorefrontShell>
        </CartProvider>
      </NextIntlClientProvider>
    </div>,
  );
}

describe.each<Locale>(['en', 'ur'])('axe — storefront (%s)', (locale) => {
  it('MenuBrowser renders with no accessibility violations', async () => {
    const { container } = renderWithLocale(<MenuBrowser menu={MOCK_PUBLIC_MENU} />, locale);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('CheckoutFlow renders with no accessibility violations', async () => {
    mockPasswordFetch();
    const { container } = renderWithLocale(
      <>
        <MenuBrowser menu={MOCK_PUBLIC_MENU} />
        <CheckoutFlow />
      </>,
      locale,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('OrderStatus renders with no accessibility violations in every decision state', async () => {
    for (const decision of ['PENDING', 'ACCEPTED', 'REJECTED'] as const) {
      const order = MOCK_PUBLIC_ORDERS.find((candidate) => candidate.decision === decision);
      expect(order).toBeDefined();
      const { container, unmount } = renderWithLocale(<OrderStatus order={order!} />, locale);
      expect(await axe(container)).toHaveNoViolations();
      unmount();
    }
  });
});
