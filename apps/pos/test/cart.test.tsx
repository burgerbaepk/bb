import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { paisa, type Totals } from '@natech/domain';
import { itemBySlug } from '@natech/contracts/mocks';
import { Cart } from '@/components/order/Cart';
import type { CartLine } from '@/components/order/cartModel';

/**
 * The cart — BUILD-PLAN.md §6.9, defects C1 and C5; ADR 0019.
 *
 * C5 is a cart labelled `Tax (16%)` regardless of how the customer will pay.
 * ADR 0019 removed the pre-payment check entirely, so this surface never
 * states a tax figure of its own: the rate is not known until `PaymentSheet`
 * opens.
 *
 * C1 is `Grand Total Rs. 1` on an empty cart with finalize enabled — the POS
 * fee, charged for nothing.
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

const CARD_TOTALS: Totals = {
  subtotal: paisa(540000n),
  discountTotal: paisa(40000n),
  taxableBase: paisa(500000n),
  taxTotal: paisa(40000n),
  serviceCharge: paisa(0n),
  posFee: paisa(100n),
  roundingAdj: paisa(0n),
  grandTotal: paisa(540100n),
  taxLines: [
    {
      taxClass: 'STANDARD_FOOD',
      rateBps: 800,
      base: paisa(500000n),
      amount: paisa(40000n),
      paymentMethodScope: 'CARD',
    },
  ],
  pricedLines: [],
};

const NO_TAX_TOTALS: Totals = {
  ...CARD_TOTALS,
  taxableBase: paisa(500000n),
  taxTotal: paisa(0n),
  grandTotal: paisa(500100n),
  taxLines: [],
};

function renderCart(
  lines: readonly CartLine[],
  onQtyConfirmed: () => void = () => {},
  overrides: Partial<ComponentProps<typeof Cart>> = {},
) {
  return render(
    <Cart
      lines={lines}
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
      onQtyConfirmed={onQtyConfirmed}
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
      onViewBill={() => {}}
      onFinalize={() => {}}
      finalizing={false}
      {...overrides}
    />,
  );
}

describe('the cart', () => {
  it('shows the complete method-specific money breakdown', () => {
    renderCart([LINE], () => {}, { totals: CARD_TOTALS });
    expect(screen.getByText('Subtotal (ex tax)')).toBeInTheDocument();
    expect(screen.getAllByText('Discount')).toHaveLength(2);
    expect(screen.getByText('Sales tax @ 8% (card)')).toBeInTheDocument();
    expect(screen.getByText('POS service fee')).toBeInTheDocument();
    expect(screen.getByText('Subtotal including tax & discount')).toBeInTheDocument();
  });

  it('does not show tax narrative when no tax applies', () => {
    renderCart([LINE], () => {}, { totals: NO_TAX_TOTALS });
    expect(screen.getByText('Subtotal')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.queryByText(/tax/i)).toBeNull();
  });

  it('offers cash sales only from the main order screen', () => {
    renderCart([LINE]);
    // Stated as a fact in the totals block, not offered as a choice — the
    // outlet takes cash and nothing else.
    expect(screen.getByText('Paid by')).toBeInTheDocument();
    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Card' })).toBeNull();
  });

  it('supports default, off, and a custom service charge for one invoice', () => {
    const onServiceChargeChange = vi.fn();
    const { rerender } = renderCart([LINE], () => {}, {
      defaultServiceChargeBps: 500,
      defaultServiceChargeEnabled: true,
      serviceChargeBpsOverride: null,
      onServiceChargeChange,
    });
    expect(screen.getByText('Outlet default: 5%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Off' }));
    expect(onServiceChargeChange).toHaveBeenCalledWith(0);

    rerender(
      <Cart
        lines={[LINE]}
        subtotal={paisa(212000n)}
        discount={paisa(0n)}
        discountReason={null}
        serviceChargeBpsOverride={750}
        defaultServiceChargeBps={500}
        defaultServiceChargeEnabled
        onServiceChargeChange={onServiceChargeChange}
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
    expect(screen.getByLabelText('Custom service charge (%)')).toHaveValue('7.5');
  });

  it('never offers service charge controls for takeaway or delivery', () => {
    renderCart([LINE], () => {}, {
      orderType: 'TAKE_AWAY',
      defaultServiceChargeBps: 500,
      defaultServiceChargeEnabled: true,
    });
    expect(screen.queryByRole('group', { name: 'Service charge mode' })).toBeNull();
  });

  it('refuses to take an empty order — C1', () => {
    renderCart([]);
    expect(screen.getByRole('button', { name: /Take Order/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Discount/ })).toBeDisabled();
  });

  it('enables Take Order once there is something to book', () => {
    renderCart([LINE]);
    expect(screen.getByRole('button', { name: /Take Order/ })).toBeEnabled();
  });

  it('disables Void and Finalize order on an empty cart — C1', () => {
    renderCart([]);
    expect(screen.getByRole('button', { name: /Finalize order/ })).toBeDisabled();
  });

  it('keeps finalize available after showing the selected-method total', () => {
    renderCart([LINE], () => {}, { totals: CARD_TOTALS });
    expect(screen.getByText('Subtotal including tax & discount')).toBeInTheDocument();
    // The button carries the amount it is about to charge, so the name is
    // "Finalize order · Rs. …" rather than the bare verb.
    expect(screen.getByRole('button', { name: /^Finalize order · Rs\./ })).toBeInTheDocument();
  });

  it('opens the bill preview without finalizing', () => {
    const onViewBill = vi.fn();
    const onFinalize = vi.fn();
    renderCart([LINE], () => {}, { totals: CARD_TOTALS, onViewBill, onFinalize });

    fireEvent.click(screen.getByRole('button', { name: 'View bill' }));
    expect(onViewBill).toHaveBeenCalledOnce();
    expect(onFinalize).not.toHaveBeenCalled();
  });

  it('hands focus back to Search when Qty loses it to nowhere in the document', () => {
    // A touch till's on-screen numeric keypad dismisses on its Done/checkmark
    // key without ever firing a real `Enter` keydown — only this blur, with
    // `relatedTarget` null because focus did not land on another element.
    // That has to loop back to Search the same as the real-keyboard path,
    // or the fast-billing loop stalls after every single item.
    const onQtyConfirmed = vi.fn();
    renderCart([LINE], onQtyConfirmed);
    const qty = screen.getByLabelText(/Quantity for/);
    fireEvent.blur(qty, { relatedTarget: null });
    expect(onQtyConfirmed).toHaveBeenCalledOnce();
  });

  it('leaves focus alone when Qty loses it to a control the cashier tapped', () => {
    const onQtyConfirmed = vi.fn();
    renderCart([LINE], onQtyConfirmed);
    const qty = screen.getByLabelText(/Quantity for/);
    const discountButton = screen.getByRole('button', { name: /Discount/ });
    fireEvent.blur(qty, { relatedTarget: discountButton });
    expect(onQtyConfirmed).not.toHaveBeenCalled();
  });

  it('lets a discount be removed once applied', () => {
    const onRemoveDiscount = vi.fn();
    renderCart([LINE], () => {}, {
      discount: paisa(50000n),
      discountReason: 'Long wait',
      onRemoveDiscount,
    });

    expect(screen.getByText(/Discount · Long wait/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove discount' }));
    expect(onRemoveDiscount).toHaveBeenCalledOnce();
  });

  it('keeps the line remove action away from the primary action — V4', () => {
    renderCart([LINE]);
    const remove = screen.getByRole('button', { name: /^Remove / });
    const takeOrder = screen.getByRole('button', { name: /Take Order/ });
    expect(remove.closest('footer')).toBeNull();
    expect(takeOrder.closest('footer')).not.toBeNull();
  });
});

describe('the POS shell', () => {
  it('shows the §8 offline banner with real queue numbers when disconnected', async () => {
    const { PosShell } = await import('@/components/shell/PosShell');

    render(
      <PosShell
        activeOrderCount={4}
        webOrderCount={1}
        shiftOpen={false}
        terminalId="11111111-1111-4111-8111-111111111111"
        terminalLabel="Till 1"
        viewerName="Sana Iqbal"
        viewerRole="CASHIER"
        canOpenBackOffice
      >
        <div />
      </PosShell>,
    );

    expect(screen.queryByRole('status')).toBeNull();

    // §8 — real `navigator.onLine`/`offline` state, not the Phase-1 switch
    // this screen used to carry (`docs/runfiles/M16-offline.md`).
    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });

    const banner = await screen.findByRole('status');
    // §8 — the real numbers, not a vague "offline". The decision a cashier
    // makes differs at two queued orders and at two hundred; this terminal has
    // queued none, so the banner says so honestly rather than showing a fixture.
    expect(within(banner).getByText(/0 orders queued/)).toBeInTheDocument();
    expect(within(banner).getByText(/Last sync/)).toBeInTheDocument();

    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  });
});

describe('delivery details', () => {
  it('shows editable address and optional charge only for delivery', () => {
    const onDeliveryAddressChange = vi.fn();
    const onDeliveryChargeChange = vi.fn();
    const view = renderCart([LINE], undefined, {
      orderType: 'DELIVERY',
      onDeliveryAddressChange,
      onDeliveryChargeChange,
    });
    fireEvent.change(screen.getByLabelText('Delivery address'), {
      target: { value: 'House 12, Lahore' },
    });
    fireEvent.change(screen.getByLabelText('Delivery charges'), { target: { value: '150.25' } });
    expect(onDeliveryAddressChange).toHaveBeenCalledWith('House 12, Lahore');
    expect(onDeliveryChargeChange).toHaveBeenCalledWith('150.25');
    view.unmount();
    renderCart([LINE], undefined, { orderType: 'TAKE_AWAY' });
    expect(screen.queryByLabelText('Delivery address')).toBeNull();
    expect(screen.queryByLabelText('Delivery charges')).toBeNull();
  });
});

it('prints KOT through its own icon and disables it for an empty cart', () => {
  const onPrintKot = vi.fn();
  const onTakeOrder = vi.fn();
  const onFinalize = vi.fn();
  const view = renderCart([LINE], undefined, { onPrintKot, onTakeOrder, onFinalize });
  fireEvent.click(screen.getByRole('button', { name: 'Print KOT' }));
  expect(onPrintKot).toHaveBeenCalledOnce();
  expect(onTakeOrder).not.toHaveBeenCalled();
  expect(onFinalize).not.toHaveBeenCalled();
  view.unmount();
  renderCart([], undefined, { onPrintKot });
  expect(screen.getByRole('button', { name: 'Print KOT' })).toBeDisabled();
});
