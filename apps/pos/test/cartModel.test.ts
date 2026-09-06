import { describe, expect, it } from 'vitest';
import { paisa, whole } from '@natech/domain';
import type { OrderLine } from '@natech/contracts';
import { lineFromOrderLine, unitPriceOf } from '@/components/order/cartModel';

/**
 * `lineFromOrderLine` — how a loaded booked order's already-sent lines
 * hydrate into the editable cart (2026-08-27). Asserts against the two
 * things that actually matter: the reconstructed line prices identically to
 * the snapshot it came from (`unitPriceOf(item, variant)` must reproduce
 * `unitPrice` exactly, since a stub variant's `priceDelta` is fabricated as
 * zero), and `sentLineId`/`key` carry the real DB id a later void needs.
 */
const ORDER_LINE: OrderLine = {
  id: '11111111-1111-4111-8111-111111111111',
  menuItemId: '22222222-2222-4222-8222-222222222222',
  variantId: '33333333-3333-4333-8333-333333333333',
  nameSnapshot: 'Mutton Tikka',
  nameUrSnapshot: 'مٹن تکہ',
  variantLabel: 'Full',
  qty: whole(4),
  unitPrice: paisa(53000n),
  lineDiscount: paisa(0n),
  taxClass: 'STANDARD_FOOD',
  seatNo: null,
  note: null,
  voidReason: null,
  modifiers: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      modifierId: '55555555-5555-4555-8555-555555555555',
      nameSnapshot: 'Extra spicy',
      nameUrSnapshot: null,
      priceDelta: paisa(5000n),
    },
  ],
};

describe('lineFromOrderLine', () => {
  it('reprices identically to the snapshot it came from', () => {
    const line = lineFromOrderLine(ORDER_LINE);
    expect(unitPriceOf(line.item, line.variant)).toBe(ORDER_LINE.unitPrice);
  });

  it('carries the real DB line id as both the cart key and sentLineId, already marked sent', () => {
    const line = lineFromOrderLine(ORDER_LINE);
    expect(line.key).toBe(ORDER_LINE.id);
    expect(line.sentLineId).toBe(ORDER_LINE.id);
    expect(line.sentAt).not.toBeNull();
  });

  it('converts the thousandths-scaled Qty back to a plain whole number', () => {
    const line = lineFromOrderLine(ORDER_LINE);
    expect(line.qty).toBe(4);
  });

  it('carries the name and modifier snapshots through, not a live lookup', () => {
    const line = lineFromOrderLine(ORDER_LINE);
    expect(line.item.name).toBe('Mutton Tikka');
    expect(line.variant?.name).toBe('Full');
    expect(line.modifiers).toHaveLength(1);
    expect(line.modifiers[0]?.name).toBe('Extra spicy');
    expect(line.modifiers[0]?.priceDelta).toBe(5000n);
  });

  it('leaves variant null when the order line has none', () => {
    const line = lineFromOrderLine({ ...ORDER_LINE, variantId: null, variantLabel: null });
    expect(line.variant).toBeNull();
  });
});
