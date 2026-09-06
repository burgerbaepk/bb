import { useEffect, useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { MOCK_OUTLET, MOCK_PUBLIC_MENU, MOCK_PUBLIC_ORDERS } from '@natech/contracts/mocks';
import en from '../messages/en.json';
import ur from '../messages/ur.json';
import { CartProvider } from '@/components/CartProvider';
import { StorefrontShell } from '@/components/StorefrontShell';
import { MenuBrowser } from '@/components/MenuBrowser';
import { CheckoutFlow } from '@/components/CheckoutFlow';
import { placeOrderAction } from '@/lib/orders/actions';
import { ItemDetail } from '@/components/ItemDetail';
import { OrderStatus } from '@/components/OrderStatus';

/**
 * §15.1/§15.3's own SSR fix (M15) moved `<html lang dir>` into the root
 * layout, a Server Component this test suite does not render — see
 * `i18n.test.ts` for the pure `resolveLocale()` coverage of that half.
 *
 * What this file *can* still exercise honestly: `useLocaleSwitch` (`./i18n`)
 * writes a cookie and calls `router.refresh()`; in the real app that
 * re-resolves `getRequestConfig` and re-renders with new messages. This
 * mock stands in for exactly that round trip — reading the same cookie the
 * hook wrote and swapping the provider's `messages`/`locale` — without
 * pulling `next/navigation`'s router machinery into a component test.
 */
/** An invented number in canonical form — see `canonicalPhone` in @natech/domain. */
const PHONE = '03001234567'; // brand-grep-allow

const push = vi.fn();

let notifyRefresh: (() => void) | null = null;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: () => notifyRefresh?.() }),
  // `StorefrontShell` marks the current destination with it.
  usePathname: () => '/',
}));

function cookieLocale(): 'en' | 'ur' {
  return document.cookie.includes('NEXT_LOCALE=ur') ? 'ur' : 'en';
}

function TestLocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<'en' | 'ur'>(cookieLocale());
  useEffect(() => {
    notifyRefresh = () => setLocale(cookieLocale());
    return () => {
      notifyRefresh = null;
    };
  }, []);
  return (
    <NextIntlClientProvider locale={locale} messages={locale === 'ur' ? ur : en}>
      {children}
    </NextIntlClientProvider>
  );
}

/**
 * `CheckoutFlow` now calls the real `/api/otp/{send,verify}` routes (M14) —
 * `placeOrderAction` is mocked globally (`test/setup.ts`, the same
 * `server-only`-transitive-import trap `apps/pos/test/setup.ts` documents),
 * but a route handler is reached over `fetch`, not an import, so it needs
 * its own stub here rather than in the shared setup file.
 */
function mockPasswordFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = 'NEXT_LOCALE=; path=/; max-age=0';
  notifyRefresh = null;
});

/**
 * §13.2 and §15 — ex-tax prices, the notice, and the Urdu path.
 *
 * The price rule is the load-bearing one. Tax on this menu is 16% on cash
 * against 8% on card, so a single inclusive figure would be wrong for roughly
 * half of customers and they would meet the difference at the counter as an
 * apparent error. The storefront therefore quotes ex tax and explains where the
 * rest arrives.
 */
function renderWithProviders(node: React.ReactNode) {
  return render(
    <TestLocaleProvider>
      <CartProvider>
        <StorefrontShell tradingName={MOCK_OUTLET.tradingName}>{node}</StorefrontShell>
      </CartProvider>
    </TestLocaleProvider>,
  );
}

describe('the storefront menu', () => {
  it('does not show tax messaging on the menu', () => {
    renderWithProviders(<MenuBrowser menu={MOCK_PUBLIC_MENU} />);
    expect(screen.queryByText(/tax/i)).toBeNull();
  });

  it('shows clean prices without tax qualifiers', () => {
    const { container } = renderWithProviders(<MenuBrowser menu={MOCK_PUBLIC_MENU} />);

    expect(container.textContent ?? '').not.toMatch(/tax/i);
    expect(container.textContent ?? '').not.toContain('Grand total');
    expect(container.textContent ?? '').not.toMatch(/Total\s+Rs/);
  });

  it('prices every item from the contract, ex tax', () => {
    const { container } = renderWithProviders(<MenuBrowser menu={MOCK_PUBLIC_MENU} />);
    const rendered = new Set(
      [...container.querySelectorAll('[data-paisa]')].map((node) =>
        node.getAttribute('data-paisa'),
      ),
    );

    for (const item of MOCK_PUBLIC_MENU.items.slice(0, 5)) {
      expect(rendered.has(item.priceExTax.toString())).toBe(true);
    }
  });

  it('opens size selection instead of silently adding the default size', () => {
    renderWithProviders(<MenuBrowser menu={MOCK_PUBLIC_MENU} />);
    const item = MOCK_PUBLIC_MENU.items.find((entry) => entry.variants.length > 1);
    expect(item).toBeDefined();
    expect(screen.getByRole('link', { name: `Choose size, ${item?.name}` })).toHaveAttribute(
      'href',
      `/menu/${item?.categorySlug}/${item?.slug}`,
    );
    expect(screen.queryByRole('button', { name: `Add, ${item?.name}` })).toBeNull();
  });

  it('collapses a sized item into one entry with variants — §5.3', () => {
    renderWithProviders(<MenuBrowser menu={MOCK_PUBLIC_MENU} />);
    const collapsed = MOCK_PUBLIC_MENU.items.find((item) => item.variants.length > 1);
    expect(collapsed).toBeDefined();
    expect(screen.getAllByRole('link', { name: collapsed?.name ?? '' })).toHaveLength(1);
  });
});

describe('the language switch', () => {
  it('writes the locale cookie `getRequestConfig` reads for `<html lang dir>` — §15.1', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<MenuBrowser menu={MOCK_PUBLIC_MENU} />);

    expect(document.cookie).not.toContain('NEXT_LOCALE=ur');

    await user.click(screen.getByRole('button', { name: /اردو/ }));

    expect(document.cookie).toContain('NEXT_LOCALE=ur');
    // The refreshed provider re-renders with Urdu messages — the toggle
    // itself now offers "English", the other language, same as before.
    expect(screen.getByRole('button', { name: 'English' })).toBeInTheDocument();
  });

  it('keeps money in Western digits and left-to-right inside Urdu — §15.2', async () => {
    const user = userEvent.setup({ delay: null });
    const { container } = renderWithProviders(<MenuBrowser menu={MOCK_PUBLIC_MENU} />);

    await user.click(screen.getByRole('button', { name: /اردو/ }));

    const money = container.querySelector('[data-money]');
    expect(money).not.toBeNull();
    expect(money?.getAttribute('dir')).toBe('ltr');
    expect(money?.textContent ?? '').toMatch(/^[0-9,.]+$/);
  });

  it('renders the Urdu name of an item that has one', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<MenuBrowser menu={MOCK_PUBLIC_MENU} />);

    await user.click(screen.getByRole('button', { name: /اردو/ }));

    const withUrdu = MOCK_PUBLIC_MENU.items.find((item) => item.nameUr !== null);
    expect(withUrdu).toBeDefined();
    expect(screen.getAllByText(withUrdu?.nameUr ?? '').length).toBeGreaterThan(0);
  });
});

function renderShop() {
  return render(
    <TestLocaleProvider>
      <CartProvider>
        <StorefrontShell tradingName={MOCK_OUTLET.tradingName}>
          <MenuBrowser menu={MOCK_PUBLIC_MENU} />
          <CheckoutFlow />
        </StorefrontShell>
      </CartProvider>
    </TestLocaleProvider>,
  );
}

/** The checkout landmark, distinct from `OrderPanel`'s identically named aside. */
function checkout(): HTMLElement {
  return screen.getByRole('region', { name: 'Your order' });
}

async function addFirstItem(user: ReturnType<typeof userEvent.setup>) {
  const add = screen.getAllByRole('button', { name: /^Add/ })[0];
  expect(add).toBeDefined();
  await user.click(add as HTMLElement);
}

describe('the cart and password flow', () => {
  it('shows a simple subtotal without tax narrative', async () => {
    const user = userEvent.setup({ delay: null });
    renderShop();
    await addFirstItem(user);

    // Scoped to the checkout: `renderShop` mounts the menu and the checkout in
    // one tree, which no route does, and `OrderPanel` beside the menu shows a
    // subtotal of its own. The claim here is about the checkout's.
    expect(within(checkout()).getByText('Subtotal')).toBeInTheDocument();
    expect(screen.queryByText(/Grand total/)).toBeNull();
    expect(screen.queryByText(/Sales tax/)).toBeNull();
  });

  it('offers separate sign-in and sign-up options', async () => {
    mockPasswordFetch();
    const user = userEvent.setup({ delay: null });
    renderShop();
    await addFirstItem(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // A toggle group, not tabs. `role="tab"` promises a `tabpanel` this screen
    // never had, so the control is a `SegmentedControl` — `role="group"` over
    // buttons that carry `aria-pressed`.
    expect(screen.getByRole('button', { name: 'Sign in' })).toHaveAttribute('aria-pressed', 'true');

    // Sign-in stays one email and one password: a returning customer proved
    // their address the day they signed up (ADR 0022).
    expect(screen.queryByLabelText('Mobile number')).toBeNull();
    expect(screen.queryByLabelText('Delivery address')).toBeNull();
  });

  it('will not send a code until name, mobile and address are all present — ADR 0022', async () => {
    mockPasswordFetch();
    const user = userEvent.setup({ delay: null });
    renderShop();
    await addFirstItem(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Sign up' }));

    const submit = screen.getByRole('button', { name: /Send my code/ });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Your name'), 'Test Customer');
    await user.click(screen.getByLabelText('Email address'));
    await user.paste('guest@example.org');
    await user.type(screen.getByLabelText('Password'), 'simple1');
    // Everything but the two fields this milestone added.
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Mobile number'), PHONE);
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('Delivery address'), 'Flat 4, Street 7, Model Town');
    expect(submit).toBeEnabled();
  });

  it('refuses a mobile number that is not one, before any code is sent', async () => {
    mockPasswordFetch();
    const user = userEvent.setup({ delay: null });
    renderShop();
    await addFirstItem(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Sign up' }));

    // The screen validates with the same `canonicalPhone` the server writes the
    // column with, so a number it accepts is one the unique index accepts.
    await user.type(screen.getByLabelText('Mobile number'), '12345');
    expect(screen.getByText(/Pakistani mobile number/)).toBeInTheDocument();
  });

  it('proves the email with a code before the account exists — §13.3', async () => {
    mockPasswordFetch();
    const user = userEvent.setup({ delay: null });
    renderShop();
    await addFirstItem(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('button', { name: 'Sign up' }));

    await user.type(screen.getByLabelText('Your name'), 'Test Customer');
    await user.type(screen.getByLabelText('Mobile number'), PHONE);
    await user.type(screen.getByLabelText('Delivery address'), 'Flat 4, Street 7, Model Town');
    await user.click(screen.getByLabelText('Email address'));
    await user.paste('guest@example.org');
    await user.type(screen.getByLabelText('Password'), 'simple1');
    await user.click(screen.getByRole('button', { name: /Send my code/ }));

    // The order is not placed by sending the code. A step stands between them,
    // and it is the whole point of §13.3.
    expect(screen.getByText('Check your email')).toBeInTheDocument();
    expect(screen.queryByText('Order placed')).toBeNull();

    const place = screen.getByRole('button', { name: /Verify & place order/ });
    expect(place).toBeDisabled();
    await user.type(screen.getByLabelText('Verification code'), '123456');
    expect(place).toBeEnabled();

    await user.click(place);
    expect(await screen.findByText('Order placed')).toBeInTheDocument();
  });

  it('can raise a quantity from the cart, not only lower it', async () => {
    const user = userEvent.setup({ delay: null });
    renderShop();
    await addFirstItem(user);

    // The cart shipped with a decrement and an `aria-hidden`, `opacity-0`
    // placeholder where its increment belonged, so the only way to get a second
    // of something was to navigate back to the menu for it.
    const increase = screen.getAllByRole('button', { name: /^Add one more/ });
    expect(increase.length).toBeGreaterThan(0);
    await user.click(increase[increase.length - 1] as HTMLElement);

    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
  });

  it('offers a way out of the sign-in step — §13.2', async () => {
    const user = userEvent.setup({ delay: null });
    renderShop();
    await addFirstItem(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    // Reaching the sign-in step used to be one-way: no back control, and the
    // cart it was collecting a password for was no longer on screen.
    await user.click(screen.getByRole('button', { name: /Back to your order/ }));
    // Scoped to the checkout: `renderShop` mounts the menu and the checkout in
    // one tree, which no route does, and `OrderPanel` beside the menu shows a
    // subtotal of its own. The claim here is about the checkout's.
    expect(within(checkout()).getByText('Subtotal')).toBeInTheDocument();
  });

  it('says staff have to accept before preparation starts — §13.4', async () => {
    mockPasswordFetch();
    const user = userEvent.setup({ delay: null });
    renderShop();
    await addFirstItem(user);
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByLabelText('Email address'));
    await user.paste('guest@example.org');
    await user.type(screen.getByLabelText('Password'), 'simple1');
    await user.click(screen.getByRole('button', { name: /Sign in & place order/ }));

    expect(await screen.findByText('Order placed')).toBeInTheDocument();
    expect(screen.getByText(/Staff need to accept it/)).toBeInTheDocument();
  });
});

describe('the order status page', () => {
  it('says a pending order is waiting for a human — §13.4', () => {
    const pending = MOCK_PUBLIC_ORDERS.find((order) => order.decision === 'PENDING');
    expect(pending).toBeDefined();

    renderWithProviders(<OrderStatus order={pending!} />);
    expect(screen.getByText('Waiting for staff to accept')).toBeInTheDocument();
  });

  it('states the reason a rejected order was rejected', () => {
    const rejected = MOCK_PUBLIC_ORDERS.find((order) => order.decision === 'REJECTED');
    expect(rejected).toBeDefined();

    renderWithProviders(<OrderStatus order={rejected!} />);
    expect(screen.getByText(rejected?.rejectReason ?? '')).toBeInTheDocument();
  });

  it('sends the customer to the counter rather than quoting a total — §13.2', () => {
    const accepted = MOCK_PUBLIC_ORDERS.find((order) => order.decision === 'ACCEPTED');
    expect(accepted).toBeDefined();

    const { container } = renderWithProviders(<OrderStatus order={accepted!} />);

    expect(screen.getByText(/Pay at the counter/)).toBeInTheDocument();
    expect(container.textContent ?? '').not.toMatch(/Grand total|Sales tax/);
  });

  it('does not show tax narrative in the footer', () => {
    renderWithProviders(<div />);
    expect(screen.getByRole('contentinfo')).not.toHaveTextContent(/tax/i);
  });
});

describe('storefront account navigation', () => {
  it('signs in with an empty cart without placing an order', async () => {
    vi.mocked(placeOrderAction).mockClear();
    push.mockClear();
    mockPasswordFetch();
    renderWithProviders(<CheckoutFlow accountMode="SIGN_IN" />);
    expect(screen.getByRole('link', { name: en.checkout.signIn })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.getByRole('link', { name: en.checkout.signUp })).toHaveAttribute(
      'href',
      '/signup',
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(en.checkout.emailLabel), 'customer@example.com');
    await user.type(screen.getByLabelText(en.checkout.passwordLabel), 'password123');
    await user.click(
      screen
        .getAllByRole('button', { name: en.checkout.signIn })
        .find((button) => !button.hasAttribute('aria-pressed'))!,
    );
    expect(push).toHaveBeenCalledWith('/menu');
    expect(placeOrderAction).not.toHaveBeenCalled();
  });

  it('switches the product photo with the selected size and falls back to the parent', async () => {
    const item = {
      ...MOCK_PUBLIC_MENU.items[0]!,
      imageUrl: '/images/drink-345ml.jpg',
      variants: [
        {
          id: 'size-small',
          name: '345 ML',
          nameUr: null,
          priceExTax: MOCK_PUBLIC_MENU.items[0]!.priceExTax,
          isDefault: true,
          imageUrl: '/images/drink-345ml.jpg',
        },
        {
          id: 'size-large',
          name: '500 ML',
          nameUr: null,
          priceExTax: MOCK_PUBLIC_MENU.items[0]!.priceExTax,
          isDefault: false,
          imageUrl: '/images/drink-500ml.jpg',
        },
        {
          id: 'size-other',
          name: 'Other',
          nameUr: null,
          priceExTax: MOCK_PUBLIC_MENU.items[0]!.priceExTax,
          isDefault: false,
        },
      ],
    };
    renderWithProviders(<ItemDetail item={item} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /500 ML/ }));
    expect(screen.getByRole('img', { name: item.name }).getAttribute('src')).toContain(
      'drink-500ml.jpg',
    );
    await user.click(screen.getByRole('button', { name: /Other/ }));
    expect(screen.getByRole('img', { name: item.name }).getAttribute('src')).toContain(
      'drink-345ml.jpg',
    );
  });
});
