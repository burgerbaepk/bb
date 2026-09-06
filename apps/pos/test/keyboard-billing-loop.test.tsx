import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { describe, it, expect } from 'vitest';
import { paisa } from '@natech/domain';
import type { MenuItem } from '@natech/contracts';
import { itemBySlug } from '@natech/contracts/mocks';
import { ProductSearch, type ProductSearchHandle } from '@/components/order/ProductSearch';
import { Cart } from '@/components/order/Cart';
import {
  addToCart,
  cartLineKey,
  changeQty,
  setQty,
  type CartLine,
} from '@/components/order/cartModel';

/**
 * The fast-billing loop: type a product number in Search, `Enter` adds it and
 * hands focus to its Qty field, type a quantity, `Enter` commits it and hands
 * focus back to Search — ready for the next product number, no pointer
 * required. `ProductSearch` and `Cart`'s own doc comments both call this out;
 * this file is the one test that wires them together the way `OrderScreen`
 * does and drives the actual keystrokes, rather than asserting on either
 * component's props in isolation.
 */
function Harness() {
  const item = { ...itemBySlug('mutton-tikka-4-pcs'), sku: '3', variants: [], modifierGroups: [] };
  const item2 = {
    ...itemBySlug('mutton-gola-kabab-5-pcs'),
    sku: '7',
    variants: [],
    modifierGroups: [],
  };
  const searchRef = useRef<ProductSearchHandle>(null);
  const [lines, setLines] = useState<readonly CartLine[]>([]);
  const [qtyFocus, setQtyFocus] = useState<{ key: string } | null>(null);

  const handlePick = (pickedItem: MenuItem) => {
    if (pickedItem.variants.length > 0 || pickedItem.modifierGroups.length > 0) return;
    const key = cartLineKey(pickedItem, null, [], null, null);
    setLines((cur) =>
      addToCart(cur, {
        key,
        item: pickedItem,
        variant: null,
        qty: 1,
        modifiers: [],
        note: null,
        seatNo: null,
        sentAt: null,
        sentLineId: null,
      }),
    );
    setQtyFocus({ key });
  };

  return (
    <div>
      <ProductSearch ref={searchRef} items={[item, item2]} onPick={handlePick} />
      <Cart
        lines={lines}
        subtotal={paisa(0n)}
        discount={paisa(0n)}
        discountReason={null}
        tableLabel={null}
        guestCount={null}
        orderNo={1}
        customerName={null}
        customerPhone={null}
        onEditCustomer={() => {}}
        canDiscount
        onQtyChange={(key, delta) => setLines((cur) => changeQty(cur, key, delta))}
        onSetQty={(key, qty) => setLines((cur) => setQty(cur, key, qty))}
        qtyFocus={qtyFocus}
        onQtyConfirmed={() => {
          // Mirrors `OrderScreen`'s own deferral — Safari does not reliably
          // honour a `.focus()` call made synchronously inside the keydown/
          // blur event Qty is still processing.
          requestAnimationFrame(() => searchRef.current?.focus());
        }}
        onRemove={() => {}}
        onPickTable={() => {}}
        onDiscount={() => {}}
        onRemoveDiscount={() => {}}
        onTakeOrder={() => {}}
        isBookedOrder={false}
        takingOrder={false}
        orderType="TAKE_AWAY"
        onOrderTypeChange={() => {}}
        onOpenOrders={() => {}}
        onVoid={() => {}}
        canVoid={false}
        onFinalize={() => {}}
        finalizing={false}
      />
    </div>
  );
}

describe('the fast-billing loop', () => {
  it('returns focus to search after committing a qty via Enter', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const search = screen.getByLabelText(/search products/i);
    await user.click(search);
    await user.keyboard('3{Enter}');

    const qtyInput = screen.getByLabelText(/Quantity for/i);
    expect(qtyInput).toHaveFocus();

    await user.keyboard('5{Enter}');

    await waitFor(() => expect(search).toHaveFocus());
    expect(qtyInput).toHaveValue('5');
  });

  it('keeps the loop working across a second, different item', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const search = screen.getByLabelText(/search products/i);
    await user.click(search);
    await user.keyboard('3{Enter}');
    await user.keyboard('2{Enter}');
    await waitFor(() => expect(search).toHaveFocus());

    await user.keyboard('7{Enter}');
    const qtyInputs = screen.getAllByLabelText(/Quantity for/i);
    const secondQty = qtyInputs[qtyInputs.length - 1];
    expect(secondQty).toHaveFocus();

    await user.keyboard('4{Enter}');
    await waitFor(() => expect(search).toHaveFocus());
    expect(secondQty).toHaveValue('4');
  });

  it('re-picking the same item merges the line and refocuses its qty', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const search = screen.getByLabelText(/search products/i);
    await user.click(search);
    await user.keyboard('3{Enter}');
    await user.keyboard('2{Enter}');
    await waitFor(() => expect(search).toHaveFocus());

    await user.keyboard('3{Enter}');
    const qtyInput = screen.getByLabelText(/Quantity for/i);
    expect(qtyInput).toHaveFocus();
    // addToCart merges: 2 (committed) + 1 (fresh pick's default qty) = 3
    expect(qtyInput).toHaveValue('3');
  });
});
