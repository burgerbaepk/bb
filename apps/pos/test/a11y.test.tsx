import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe, toHaveNoViolations } from 'jest-axe';
import { paisa } from '@natech/domain';
import { itemBySlug } from '@natech/contracts/mocks';
import { Cart } from '@/components/order/Cart';
import { PosShell } from '@/components/shell/PosShell';
import type { CartLine } from '@/components/order/cartModel';

expect.extend(toHaveNoViolations);

/**
 * M18 · performance-a11y — BUILD-PLAN.md §18/§19 ("Keyboard navigable, axe
 * clean"), `docs/runfiles/M18-performance-a11y.md`.
 *
 * The till is English-only (§15.1) — no `ur`/RTL pass here, unlike the
 * storefront's own `test/a11y.test.tsx`. `Cart` is the primary order-entry
 * surface; `PosShell` is the frame every screen in this app renders inside,
 * including its offline banner.
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

describe('axe — POS', () => {
  it('Cart renders with no accessibility violations', async () => {
    const { container } = render(
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
        canVoid={false}
        onFinalize={() => {}}
        finalizing={false}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('PosShell renders with no accessibility violations', async () => {
    const { container } = render(
      <PosShell
        activeOrderCount={4}
        webOrderCount={1}
        shiftOpen
        terminalId="11111111-1111-4111-8111-111111111111"
        terminalLabel="Till 1"
        viewerName="Sana Iqbal"
        viewerRole="CASHIER"
        canOpenBackOffice
      >
        <div />
      </PosShell>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
