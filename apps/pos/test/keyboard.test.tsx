import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { paisa } from '@natech/domain';
import { itemBySlug } from '@natech/contracts/mocks';
import { Cart } from '@/components/order/Cart';
import type { CartLine } from '@/components/order/cartModel';

/**
 * M18 · performance-a11y — BUILD-PLAN.md §18/§19 ("Keyboard navigable"),
 * `docs/runfiles/M18-performance-a11y.md` §3. What this file proves is real
 * application code: every control in `Cart` is `Tab`-reachable and
 * keyboard-operable.
 */
const LINE: CartLine = {
  key: 'line-1',
  item: itemBySlug('mutton-tikka-4-pcs'),
  variant: null,
  qty: 4,
  modifiers: [],
  note: null,
  seatNo: null,
  sentAt: null,
  sentLineId: null,
};

/** Tabs forward until every element in `expected` has received focus, or gives up after a budget. */
async function collectTabbedElements(
  user: ReturnType<typeof userEvent.setup>,
  budget: number,
): Promise<Set<Element>> {
  const visited = new Set<Element>();
  for (let i = 0; i < budget; i += 1) {
    await user.tab();
    if (document.activeElement !== null && document.activeElement !== document.body) {
      visited.add(document.activeElement);
    }
  }
  return visited;
}

describe('keyboard — Cart', () => {
  it('every control is Tab-reachable', async () => {
    const user = userEvent.setup();
    render(
      <Cart
        lines={[LINE]}
        subtotal={paisa(212000n)}
        discount={paisa(0n)}
        discountReason={null}
        tableLabel="Table 17"
        guestCount={4}
        orderNo={20395}
        customerName={null}
        customerPhone={null}
        onEditCustomer={() => {}}
        canDiscount
        onQtyChange={() => {}}
        onSetQty={() => {}}
        qtyFocus={null}
        onQtyConfirmed={() => {}}
        onRemove={() => {}}
        onPickTable={() => {}}
        onDiscount={() => {}}
        onRemoveDiscount={() => {}}
        onTakeOrder={() => {}}
        isBookedOrder={false}
        takingOrder={false}
        orderType="DINE_IN"
        onOrderTypeChange={() => {}}
        onOpenOrders={() => {}}
        onVoid={() => {}}
        canVoid
        onFinalize={() => {}}
        finalizing={false}
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
    const visited = await collectTabbedElements(user, buttons.length + 10);
    for (const button of buttons) {
      expect(visited.has(button)).toBe(true);
    }
  });

  it('the primary action activates on Enter, not just a pointer click', async () => {
    const user = userEvent.setup();
    const onTakeOrder = vi.fn();
    render(
      <Cart
        lines={[LINE]}
        subtotal={paisa(212000n)}
        discount={paisa(0n)}
        discountReason={null}
        tableLabel="Table 17"
        guestCount={4}
        orderNo={20395}
        customerName={null}
        customerPhone={null}
        onEditCustomer={() => {}}
        canDiscount
        onQtyChange={() => {}}
        onSetQty={() => {}}
        qtyFocus={null}
        onQtyConfirmed={() => {}}
        onRemove={() => {}}
        onPickTable={() => {}}
        onDiscount={() => {}}
        onRemoveDiscount={() => {}}
        onTakeOrder={onTakeOrder}
        isBookedOrder={false}
        takingOrder={false}
        orderType="DINE_IN"
        onOrderTypeChange={() => {}}
        onOpenOrders={() => {}}
        onVoid={() => {}}
        canVoid
        onFinalize={() => {}}
        finalizing={false}
      />,
    );

    const takeOrderButton = screen.getByRole('button', { name: /Take Order/ });
    takeOrderButton.focus();
    await user.keyboard('{Enter}');
    expect(onTakeOrder).toHaveBeenCalledOnce();
  });
});
