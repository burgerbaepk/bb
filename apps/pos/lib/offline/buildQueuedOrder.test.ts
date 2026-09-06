import { describe, expect, it } from 'vitest';
import { paisa } from '@natech/domain';
import { itemBySlug } from '@natech/contracts/mocks';
import { QueuedOrderSchema } from '@natech/contracts';
import type { CartLine } from '@/components/order/cartModel';
import { buildQueuedOrder } from './buildQueuedOrder';

/**
 * §8 — `packages/contracts/src/sync.ts`'s `QueuedOrderSchema` is the frozen
 * wire contract the replay endpoint validates against; this asserts what
 * `OrderScreen` builds offline actually conforms to it, byte for byte.
 */
const LINE: CartLine = {
  key: 'line-1',
  item: itemBySlug('mutton-tikka-4-pcs'),
  variant: null,
  qty: 2,
  modifiers: [],
  note: 'no onion',
  seatNo: null,
  sentAt: new Date(),
  sentLineId: null,
};

describe('buildQueuedOrder — §8', () => {
  it('produces a wire shape that parses against the frozen QueuedOrderSchema', () => {
    const queued = buildQueuedOrder({
      clientOrderUuid: '11111111-1111-4111-8111-111111111111',
      terminalId: '22222222-2222-4222-8222-222222222222',
      orderNo: 20395,
      type: 'DINE_IN',
      tableId: null,
      guestCount: 2,
      serviceStartedAt: new Date('2026-08-26T18:00:00Z'),
      openedAt: new Date('2026-08-26T17:55:00Z'),
      orderDiscount: paisa(0n),
      lines: [LINE],
      payments: [
        { method: 'CASH', amount: paisa(100000n), attemptStatus: 'APPROVED', declinedReason: null },
      ],
      clientGrandTotal: paisa(100000n),
      clientTaxTotal: paisa(16000n),
    });

    expect(QueuedOrderSchema.parse(queued)).toBeTruthy();
    expect(queued.lines).toHaveLength(1);
    expect(queued.lines[0]?.note).toBe('no onion');
  });

  it('gives every line its own clientLineUuid, distinct from the cart key', () => {
    const queued = buildQueuedOrder({
      clientOrderUuid: '11111111-1111-4111-8111-111111111111',
      terminalId: '22222222-2222-4222-8222-222222222222',
      orderNo: 1,
      type: 'TAKE_AWAY',
      tableId: null,
      guestCount: null,
      serviceStartedAt: new Date(),
      openedAt: new Date(),
      orderDiscount: paisa(0n),
      lines: [LINE, { ...LINE, key: 'line-2' }],
      payments: [],
      clientGrandTotal: null,
      clientTaxTotal: null,
    });

    const ids = queued.lines.map((line) => line.clientLineUuid);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).not.toBe('line-1');
  });

  it('carries a null amount forward as null, not "null" or "0"', () => {
    const queued = buildQueuedOrder({
      clientOrderUuid: '11111111-1111-4111-8111-111111111111',
      terminalId: '22222222-2222-4222-8222-222222222222',
      orderNo: 1,
      type: 'TAKE_AWAY',
      tableId: null,
      guestCount: null,
      serviceStartedAt: new Date(),
      openedAt: new Date(),
      orderDiscount: paisa(0n),
      lines: [LINE],
      payments: [],
      clientGrandTotal: null,
      clientTaxTotal: null,
    });

    expect(queued.clientGrandTotal).toBeNull();
    expect(queued.clientTaxTotal).toBeNull();
  });
});

it.each(['DELIVERY', 'TAKE_AWAY'] as const)(
  'preserves delivery details only for %s during replay',
  (type) => {
    const queued = buildQueuedOrder({
      clientOrderUuid: '11111111-1111-4111-8111-111111111111',
      terminalId: '22222222-2222-4222-8222-222222222222',
      orderNo: 1,
      type,
      tableId: null,
      guestCount: null,
      serviceStartedAt: new Date(),
      openedAt: new Date(),
      orderDiscount: paisa(0n),
      deliveryAddress: 'House 12, Lahore',
      deliveryCharge: paisa(15025n),
      lines: [LINE],
      payments: [],
      clientGrandTotal: null,
      clientTaxTotal: null,
    });
    const parsed = QueuedOrderSchema.parse(queued);
    expect(parsed.deliveryCharge).toBe(type === 'DELIVERY' ? '15025' : '0');
    expect(parsed.deliveryAddress).toBe(type === 'DELIVERY' ? 'House 12, Lahore' : null);
    expect(QueuedOrderSchema.safeParse({ ...queued, deliveryCharge: '-1' }).success).toBe(false);
  },
);
