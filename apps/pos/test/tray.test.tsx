import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@natech/ui';
import { MOCK_TRAY_ORDERS } from '@natech/contracts/mocks';
import { ActiveOrdersTray } from '@/components/tray/ActiveOrdersTray';

/**
 * `@/lib/orders/actions` is mocked the same way `test/floor-editor.test.tsx`
 * mocks `@/lib/floor/actions`: the real file imports `lib/auth/session.ts`,
 * which imports `server-only`, and `server-only` throws unconditionally
 * outside Next's own bundler. `next/navigation`'s `useRouter` needs a stub
 * too — there is no `AppRouterContext` mounted under a plain
 * `@testing-library/react` render, and `@/lib/realtime/useFloorRealtime`'s
 * live subscription is exactly what §16's poll backstop exists to make
 * unnecessary for a functional test.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/orders/actions', () => ({
  voidOrderAction: vi.fn(async () => ({ ok: true, error: null })),
}));
vi.mock('@/lib/realtime/useFloorRealtime', () => ({ useFloorRealtime: () => {} }));

/**
 * R16 — a header count and a header sum derive from the same query as the list
 * they head. BUILD-PLAN.md §2 R16, §11.2, defects C3, V1.
 *
 * The system this replaces shows `Total Revenue Rs. 0` beside `Total Orders
 * 19984` (C3), and a header reading four orders and Rs. 40,623.70 above three
 * cards summing Rs. 34,161.30 (V1). Both are a header fed by a different query
 * than its list.
 *
 * Asserting the two agree on the unfiltered view is weak — they would agree by
 * accident. So the tests below **narrow the list** and check the header follows,
 * which is where a header fed by its own query diverges.
 */
function renderTray() {
  return render(
    <ToastProvider>
      <ActiveOrdersTray orders={MOCK_TRAY_ORDERS} zones={['Front', 'Bala', 'Upstairs']} />
    </ToastProvider>,
  );
}

function headerCount(container: HTMLElement): number {
  return Number(container.querySelector('[data-tray-count]')?.getAttribute('data-tray-count'));
}

function headerSum(): bigint {
  return BigInt(screen.getByLabelText(/^Subtotal excluding tax/).getAttribute('data-paisa') ?? '0');
}

describe('the booked-orders tray header', () => {
  it('counts exactly the cards it renders', () => {
    const { container } = renderTray();
    expect(headerCount(container)).toBe(screen.getAllByRole('article').length);
    expect(headerCount(container)).toBe(MOCK_TRAY_ORDERS.length);
  });

  it('sums exactly the orders it renders', () => {
    renderTray();
    const expected = MOCK_TRAY_ORDERS.reduce((total, order) => total + order.subtotalExTax, 0n);
    expect(headerSum()).toBe(expected);
  });

  it('follows the list when the list narrows', async () => {
    const user = userEvent.setup({ delay: null });
    const { container } = renderTray();

    const types = screen.getByRole('group', { name: 'Filter by type' });
    await user.click(within(types).getByRole('button', { name: /^Takeaway/ }));

    const takeawayOrders = MOCK_TRAY_ORDERS.filter((order) => order.type === 'TAKE_AWAY');
    expect(takeawayOrders.length).toBeGreaterThan(0);
    expect(takeawayOrders.length).toBeLessThan(MOCK_TRAY_ORDERS.length);

    expect(screen.getAllByRole('article')).toHaveLength(takeawayOrders.length);
    expect(headerCount(container)).toBe(takeawayOrders.length);
    expect(headerSum()).toBe(
      takeawayOrders.reduce((total, order) => total + order.subtotalExTax, 0n),
    );
  });
});

describe('a booked-order card', () => {
  it('shows a complete payment breakdown and lets the cashier compare card with cash', async () => {
    const user = userEvent.setup({ delay: null });
    renderTray();
    expect(screen.getAllByText('Subtotal (ex tax)')).toHaveLength(MOCK_TRAY_ORDERS.length);
    expect(screen.getAllByText('Amount due')).toHaveLength(MOCK_TRAY_ORDERS.length);

    const firstCard = screen.getAllByRole('article')[0];
    expect(firstCard).toBeDefined();
    const paymentMethods = within(firstCard as HTMLElement).getByRole('group', {
      name: 'Payment method',
    });
    // Cash is the till's default, so the card quotes the cash total first.
    expect(within(paymentMethods).getByRole('button', { name: 'Cash' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(within(paymentMethods).getByRole('button', { name: 'Card' }));
    expect(within(paymentMethods).getByRole('button', { name: 'Card' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows the delivery address and phone on a delivery card (ADR 0028)', () => {
    const [first] = MOCK_TRAY_ORDERS;
    if (first === undefined) throw new Error('No mock tray order.');
    render(
      <ToastProvider>
        <ActiveOrdersTray
          orders={[
            {
              ...first,
              type: 'DELIVERY',
              tableCode: null,
              customerPhone: '555-0100',
              deliveryAddress: 'House 12, Block B, Satellite Town',
            },
          ]}
          zones={[]}
        />
      </ToastProvider>,
    );
    expect(screen.getByText('Deliver to')).toBeInTheDocument();
    expect(screen.getByText('House 12, Block B, Satellite Town')).toBeInTheDocument();
    expect(screen.getByText('555-0100')).toBeInTheDocument();
  });

  it('offers exactly two actions, Load order and Delete — no payment actions here by design (2026-08-27)', () => {
    renderTray();
    expect(screen.getAllByRole('button', { name: 'Load order' })).toHaveLength(
      MOCK_TRAY_ORDERS.length,
    );
    expect(screen.queryByRole('button', { name: /Take payment/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /More actions/ })).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('asks for confirmation instead of deleting instantly, even from the visible icon — defect V4', async () => {
    const user = userEvent.setup({ delay: null });
    renderTray();

    const firstOrder = MOCK_TRAY_ORDERS[0];
    expect(firstOrder).toBeDefined();
    const deleteIcon = screen.getByRole('button', { name: `Delete order ${firstOrder?.orderNo}` });
    await user.click(deleteIcon);

    expect(
      screen.getByRole('heading', { name: `Void order #${firstOrder?.orderNo}` }),
    ).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Void order' });
    expect(confirm).toBeEnabled();
    expect(screen.queryByLabelText(/PIN/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Reason')).not.toBeInTheDocument();
  });

  it('renders order types as chips, including the empty one — defect V6', () => {
    renderTray();
    const types = screen.getByRole('group', { name: 'Filter by type' });
    for (const label of [/^All/, /^Dine-in/, /^Takeaway/, /^Delivery/]) {
      expect(within(types).getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('offers sort and filter, and never a search by amount — V7, V8', () => {
    renderTray();
    expect(screen.getByRole('group', { name: 'Sort' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Filter by state' })).toBeInTheDocument();
    expect(screen.getByLabelText('Search by table, order number, or customer')).toBeInTheDocument();
  });

  it('never renders a negative duration — R13, defect V2', () => {
    const { container } = renderTray();
    expect(container.textContent ?? '').not.toMatch(/-\d\d:\d\d/);
  });
});
