import { describe, expect, it } from 'vitest';
import type { Paisa } from '../src/money/paisa';
import { computeTotals } from '../src/tax/engine';
import { DEFAULT_TAX_POLICY } from '../src/tax/policy';
import { APPENDIX_A1, APPENDIX_A1_LINES, RULES, SERVICE_STARTED_AT } from './fixtures';

/**
 * Appendix A — the golden fixtures. BUILD-PLAN.md §6.14, §18 (M03 gate).
 *
 * Appendix A opens: "Any change to `packages/domain` altering this output is a
 * breaking change." These figures were paid by a customer and filed with PRA
 * and FBR. If one of these fails, the engine is wrong, not the fixture.
 */

const BASE = {
  lines: APPENDIX_A1_LINES,
  orderType: 'DINE_IN' as const,
  serviceStartedAt: SERVICE_STARTED_AT,
  rules: RULES,
  policy: DEFAULT_TAX_POLICY,
};

describe('Appendix A.1 — tax invoice INV-20260822-11272', () => {
  const totals = computeTotals({ ...BASE, payments: [{ method: 'CARD', amount: 0n as Paisa }] });

  it('reproduces the line subtotal at 12,220.00', () => {
    expect(totals.subtotal).toBe(APPENDIX_A1.subtotal);
  });

  it('reproduces each line extension exactly', () => {
    const extensions = totals.pricedLines.map((p) => p.extended);
    expect(extensions).toEqual([
      212000n, // 4 x 530.00
      198000n, // 3 x 660.00
      417000n, // 3 x 1,390.00
      302000n, // 1 x 3,020.00
      24000n, //  3 x 80.00
      26000n, //  1 x 260.00
      27000n, //  1 x 270.00
      16000n, //  1 x 160.00
    ]);
  });

  it('applies no order discount', () => {
    expect(totals.discountTotal).toBe(0n);
  });

  it('taxes a base of 12,220.00', () => {
    expect(totals.taxableBase).toBe(APPENDIX_A1.subtotal);
  });

  it('charges sales tax of 977.60 at 8 percent on card', () => {
    expect(totals.taxTotal).toBe(APPENDIX_A1.taxCard);
  });

  it('charges a POS service fee of 1.00', () => {
    expect(totals.posFee).toBe(APPENDIX_A1.posFee);
  });

  it('charges a service charge of 611.00 at 5 percent, untaxed', () => {
    expect(totals.serviceCharge).toBe(APPENDIX_A1.serviceCharge);
  });

  it('reaches a grand total of 13,809.60 — byte-exact', () => {
    expect(totals.grandTotal).toBe(APPENDIX_A1.totalCard);
    expect(totals.grandTotal).toBe(1380960n);
  });

  it('produces exactly one tax line: STANDARD_FOOD, 800 bps, base 1222000, amount 97760, CARD', () => {
    expect(totals.taxLines).toHaveLength(1);
    expect(totals.taxLines[0]).toMatchObject({
      taxClass: 'STANDARD_FOOD',
      rateBps: 800,
      base: 1222000n,
      amount: 97760n,
      paymentMethodScope: 'CARD',
    });
  });

  it('needs no rounding adjustment', () => {
    expect(totals.roundingAdj).toBe(0n);
  });

  it('has parts that sum to the whole', () => {
    const parts = totals.taxableBase + totals.taxTotal + totals.posFee + totals.serviceCharge;
    expect(parts).toBe(totals.grandTotal);
  });
});

describe('Appendix A.3 — card declined, then settled in cash', () => {
  // The declined attempt is recorded in `payments` with attempt_status
  // DECLINED, but it contributes nothing to the computation: only approved
  // payments reach the engine.
  const totals = computeTotals({
    ...BASE,
    payments: [{ method: 'CASH', amount: 1478720n as Paisa }],
  });

  it('totals 14,787.20, not the 13,809.60 the check quoted for card', () => {
    expect(totals.grandTotal).toBe(APPENDIX_A1.totalCash);
  });

  it('taxes at 1600 bps', () => {
    expect(totals.taxLines[0]?.rateBps).toBe(1600);
    expect(totals.taxTotal).toBe(APPENDIX_A1.taxCash);
  });
});

describe('delivery charges', () => {
  const delivery = {
    ...BASE,
    orderType: 'DELIVERY' as const,
    payments: [{ method: 'CASH' as const, amount: 0n as Paisa }],
  };
  it('adds a fixed charge without discounting or taxing it', () => {
    const free = computeTotals({ ...delivery, orderDiscount: 10000n as Paisa });
    const charged = computeTotals({
      ...delivery,
      orderDiscount: 10000n as Paisa,
      deliveryCharge: 15025n as Paisa,
    });
    expect(charged.grandTotal - free.grandTotal).toBe(15025n);
    expect(charged.taxTotal).toBe(free.taxTotal);
    expect(charged.deliveryCharge).toBe(15025n);
    expect(charged.serviceCharge).toBe(0n);
  });
  it.each(['DINE_IN', 'TAKE_AWAY'] as const)('never charges delivery for %s', (orderType) => {
    expect(
      computeTotals({ ...delivery, orderType, deliveryCharge: 15000n as Paisa }).deliveryCharge,
    ).toBe(0n);
  });
  it.each([-1n, 100000001n])('rejects invalid charge %s', (amount) => {
    expect(() => computeTotals({ ...delivery, deliveryCharge: amount as Paisa })).toThrow(
      RangeError,
    );
  });
  it('includes delivery before rounding and after post-tax discounts', () => {
    const totals = computeTotals({
      ...delivery,
      deliveryCharge: 15025n as Paisa,
      orderDiscount: 10000n as Paisa,
      policy: { ...BASE.policy, discountBeforeTax: false, rounding: 'NEAREST_RUPEE' },
    });
    expect(totals.grandTotal % 100n).toBe(0n);
    expect(totals.grandTotal).toBe(
      totals.taxableBase +
        totals.taxTotal +
        totals.posFee +
        totals.serviceCharge +
        totals.deliveryCharge! -
        totals.discountTotal +
        totals.roundingAdj,
    );
  });
});
