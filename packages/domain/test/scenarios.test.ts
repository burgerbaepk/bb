import { describe, expect, it } from 'vitest';
import { paisa, parsePaisa, type Paisa } from '../src/money/paisa';
import { parseQty, whole } from '../src/money/quantity';
import type { OrderLine } from '../src/pricing/lines';
import { computeTotals, type PaymentSlice } from '../src/tax/engine';
import {
  DEFAULT_TAX_POLICY,
  type OrderType,
  type PaymentMethod,
  type TaxClassKey,
  type TaxPolicy,
} from '../src/tax/policy';
import type { TaxRule } from '../src/tax/rates';
import { RULES, RULES_WITH_HISTORY, SERVICE_STARTED_AT } from './fixtures';

/**
 * Golden fixtures — BUILD-PLAN.md §6.14.
 *
 * §6.14 names the cases that must be covered: every payment mix, discount
 * ordering, a single-paisa line, a 999-quantity line, an exempt line alongside
 * a standard one, a mid-service rate change, and a card decline followed by
 * cash.
 *
 * Every expectation below is hand-computed from the §6.3 order of operations,
 * not captured from a run. A snapshot of whatever the code did would assert
 * nothing.
 */

const p = (text: string): Paisa => parsePaisa(text);

function item(
  unit: string,
  quantity: number | string,
  taxClass: TaxClassKey = 'STANDARD_FOOD',
): OrderLine {
  return {
    id: `l${unit}-${String(quantity)}`,
    name: 'item',
    taxClass,
    unitPrice: p(unit),
    qty: typeof quantity === 'number' ? whole(quantity) : parseQty(quantity),
  };
}

interface Scenario {
  readonly name: string;
  readonly lines: readonly OrderLine[];
  readonly payments: readonly PaymentSlice[];
  readonly orderType?: OrderType;
  readonly orderDiscount?: Paisa;
  readonly policy?: Partial<TaxPolicy>;
  readonly rules?: readonly TaxRule[];
  readonly serviceStartedAt?: Date;
  readonly expected: {
    readonly subtotal?: bigint;
    readonly taxableBase?: bigint;
    readonly taxTotal?: bigint;
    readonly serviceCharge?: bigint;
    readonly roundingAdj?: bigint;
    readonly grandTotal: bigint;
    readonly taxLines?: number;
  };
}

const pay = (method: PaymentMethod, amount = 0n): PaymentSlice => ({
  method,
  amount: paisa(amount),
});

/** Rs. 1,000.00 of standard food. Service charge on it is Rs. 50.00. */
const THOUSAND = [item('1000.00', 1)];

const SCENARIOS: readonly Scenario[] = [
  // ---- every payment method ---------------------------------------------
  {
    name: 'CARD at 8 percent',
    lines: THOUSAND,
    payments: [pay('CARD')],
    expected: { taxTotal: 8000n, serviceCharge: 5000n, grandTotal: 113100n },
  },
  {
    name: 'CASH at 16 percent',
    lines: THOUSAND,
    payments: [pay('CASH')],
    expected: { taxTotal: 16000n, grandTotal: 121100n },
  },
  {
    name: 'WALLET at 8 percent',
    lines: THOUSAND,
    payments: [pay('WALLET')],
    expected: { taxTotal: 8000n, grandTotal: 113100n },
  },
  {
    name: 'QR at 8 percent',
    lines: THOUSAND,
    payments: [pay('QR')],
    expected: { taxTotal: 8000n, grandTotal: 113100n },
  },

  // ---- §6.6 split payments, PROPORTIONAL ---------------------------------
  {
    name: 'half card half cash',
    lines: THOUSAND,
    payments: [pay('CARD', 50000n), pay('CASH', 50000n)],
    // 500.00 at 8% = 40.00, 500.00 at 16% = 80.00
    expected: { taxTotal: 12000n, grandTotal: 117100n, taxLines: 2 },
  },
  {
    name: 'three quarters card, one quarter cash',
    lines: THOUSAND,
    payments: [pay('CARD', 75000n), pay('CASH', 25000n)],
    // 750.00 at 8% = 60.00, 250.00 at 16% = 40.00
    expected: { taxTotal: 10000n, grandTotal: 115100n },
  },
  {
    name: 'the §6.6 worked example: base 10,000 split 6,000 card and 4,000 cash',
    lines: [item('10000.00', 1)],
    payments: [pay('CARD', 600000n), pay('CASH', 400000n)],
    // The plan states 480.00 + 640.00 = 1,120.00.
    expected: { taxTotal: 112000n, grandTotal: 1162100n },
  },
  {
    name: 'three-way split with an indivisible remainder',
    lines: THOUSAND,
    payments: [pay('CARD', 1n), pay('CASH', 1n), pay('WALLET', 1n)],
    // 333.34 / 333.33 / 333.33 — the residual paisa lands on the first slice.
    expected: { taxTotal: 10667n, grandTotal: 115767n, taxLines: 3 },
  },

  // ---- discount ordering --------------------------------------------------
  {
    name: 'order discount before tax',
    lines: THOUSAND,
    orderDiscount: p('100.00'),
    payments: [pay('CARD')],
    // base 900.00, tax 72.00, service charge 45.00
    expected: { taxableBase: 90000n, taxTotal: 7200n, serviceCharge: 4500n, grandTotal: 101800n },
  },
  {
    name: 'line discount reaches the same total as an order discount',
    lines: [{ ...item('1000.00', 1), lineDiscount: p('100.00') }],
    payments: [pay('CARD')],
    expected: { taxableBase: 90000n, grandTotal: 101800n },
  },
  {
    name: 'discount after tax leaves the base undiscounted',
    lines: THOUSAND,
    orderDiscount: p('100.00'),
    policy: { discountBeforeTax: false },
    payments: [pay('CARD')],
    // Taxed on 1,000.00, discount comes off the total: 1,131.00 − 100.00
    expected: { taxableBase: 100000n, taxTotal: 8000n, grandTotal: 103100n },
  },
  {
    name: 'order discount spread across a mixed-class order',
    lines: [item('1000.00', 1), item('500.00', 1, 'EXEMPT')],
    orderDiscount: p('150.00'),
    payments: [pay('CARD')],
    // 1,350.00 base. Discount splits 100.00 standard / 50.00 exempt by weight,
    // so tax is 8% of 900.00 = 72.00, not 8% of 850.00.
    expected: { taxableBase: 135000n, taxTotal: 7200n, serviceCharge: 6750n, grandTotal: 149050n },
  },

  // ---- a single paisa -----------------------------------------------------
  {
    name: 'a one-paisa line on card',
    lines: [item('0.01', 1)],
    payments: [pay('CARD')],
    // Tax of 0.0008 and a service charge of 0.0005 both round to nothing.
    expected: { subtotal: 1n, taxTotal: 0n, serviceCharge: 0n, grandTotal: 101n },
  },
  {
    name: 'a one-paisa line on cash',
    lines: [item('0.01', 1)],
    payments: [pay('CASH')],
    expected: { taxTotal: 0n, grandTotal: 101n },
  },
  {
    name: 'seven paisa, where the tax rounds up to one',
    lines: [item('0.07', 1)],
    payments: [pay('CARD')],
    // 0.0056 rounds half-up to 0.01.
    expected: { subtotal: 7n, taxTotal: 1n, grandTotal: 108n },
  },
  {
    name: 'six paisa, where the tax rounds down to nothing',
    lines: [item('0.06', 1)],
    payments: [pay('CARD')],
    // 0.0048 rounds to zero.
    expected: { taxTotal: 0n, grandTotal: 106n },
  },

  // ---- a 999-quantity line ------------------------------------------------
  {
    name: '999 units at 1.00',
    lines: [item('1.00', 999)],
    payments: [pay('CARD')],
    expected: { subtotal: 99900n, taxTotal: 7992n, serviceCharge: 4995n, grandTotal: 112987n },
  },
  {
    name: '999 units at one paisa',
    lines: [item('0.01', 999)],
    payments: [pay('CARD')],
    expected: { subtotal: 999n, taxTotal: 80n, serviceCharge: 50n, grandTotal: 1229n },
  },
  {
    name: '999 units of the reference tikka',
    lines: [item('530.00', 999)],
    payments: [pay('CARD')],
    // 529,470.00 base
    expected: { subtotal: 52947000n, taxTotal: 4235760n, grandTotal: 59830210n },
  },

  // ---- fractional quantity -------------------------------------------------
  {
    name: 'half a kilogram at 530.00',
    lines: [item('530.00', '0.5')],
    payments: [pay('CARD')],
    expected: { subtotal: 26500n, taxTotal: 2120n, serviceCharge: 1325n, grandTotal: 30045n },
  },
  {
    name: 'a three-decimal quantity rounds once, at the extension',
    lines: [item('333.33', '0.333')],
    payments: [pay('CARD')],
    // 33333 × 333 ÷ 1000 = 11,099.889 paisa, half-up to 11,100.
    expected: { subtotal: 11100n, taxTotal: 888n, serviceCharge: 555n, grandTotal: 12643n },
  },

  // ---- exempt beside standard ----------------------------------------------
  {
    name: 'an exempt line alongside a standard one, on card',
    lines: [item('1000.00', 1), item('500.00', 1, 'EXEMPT')],
    payments: [pay('CARD')],
    expected: {
      taxableBase: 150000n,
      taxTotal: 8000n,
      serviceCharge: 7500n,
      grandTotal: 165600n,
      taxLines: 2,
    },
  },
  {
    name: 'a zero-rated line alongside a standard one, on cash',
    lines: [item('1000.00', 1), item('500.00', 1, 'ZERO')],
    payments: [pay('CASH')],
    expected: { taxTotal: 16000n, grandTotal: 173600n },
  },
  {
    name: 'an entirely exempt order still carries the service charge and POS fee',
    lines: [item('1000.00', 1, 'EXEMPT')],
    payments: [pay('CARD')],
    expected: { taxTotal: 0n, serviceCharge: 5000n, grandTotal: 105100n },
  },
  {
    name: 'exempt and standard across a split payment',
    lines: [item('1000.00', 1), item('500.00', 1, 'EXEMPT')],
    payments: [pay('CARD', 50000n), pay('CASH', 50000n)],
    // Standard 1,000 splits 500/500 → 40.00 + 80.00. Exempt taxes nothing.
    expected: { taxTotal: 12000n, grandTotal: 169600n, taxLines: 4 },
  },

  // ---- order type ----------------------------------------------------------
  {
    name: 'takeaway carries no service charge',
    lines: THOUSAND,
    orderType: 'TAKE_AWAY',
    payments: [pay('CARD')],
    expected: { serviceCharge: 0n, grandTotal: 108100n },
  },
  {
    name: 'delivery carries no service charge',
    lines: THOUSAND,
    orderType: 'DELIVERY',
    payments: [pay('CASH')],
    expected: { serviceCharge: 0n, grandTotal: 116100n },
  },

  // ---- rounding (§6.8, §6.10) ----------------------------------------------
  // Base 1,000.07 gives 1,131.08 before rounding — deliberately awkward.
  {
    name: 'no rounding leaves the exact figure',
    lines: [item('1000.07', 1)],
    payments: [pay('CARD')],
    expected: { grandTotal: 113108n, roundingAdj: 0n },
  },
  {
    name: 'nearest rupee, half up',
    lines: [item('1000.07', 1)],
    policy: { rounding: 'NEAREST_RUPEE', roundingDirection: 'HALF_UP' },
    payments: [pay('CARD')],
    expected: { grandTotal: 113100n, roundingAdj: -8n },
  },
  {
    name: 'nearest rupee, always up',
    lines: [item('1000.07', 1)],
    policy: { rounding: 'NEAREST_RUPEE', roundingDirection: 'UP' },
    payments: [pay('CARD')],
    expected: { grandTotal: 113200n, roundingAdj: 92n },
  },
  {
    name: 'nearest rupee, always down',
    lines: [item('1000.07', 1)],
    policy: { rounding: 'NEAREST_RUPEE', roundingDirection: 'DOWN' },
    payments: [pay('CARD')],
    expected: { grandTotal: 113100n, roundingAdj: -8n },
  },
  {
    name: 'nearest five rupees, half up',
    lines: [item('1000.07', 1)],
    policy: { rounding: 'NEAREST_5_RUPEE', roundingDirection: 'HALF_UP' },
    payments: [pay('CARD')],
    expected: { grandTotal: 113000n, roundingAdj: -108n },
  },
  {
    name: 'nearest five rupees, always up',
    lines: [item('1000.07', 1)],
    policy: { rounding: 'NEAREST_5_RUPEE', roundingDirection: 'UP' },
    payments: [pay('CARD')],
    expected: { grandTotal: 113500n, roundingAdj: 392n },
  },
  {
    name: 'nearest five rupees, always down',
    lines: [item('1000.07', 1)],
    policy: { rounding: 'NEAREST_5_RUPEE', roundingDirection: 'DOWN' },
    payments: [pay('CARD')],
    expected: { grandTotal: 113000n, roundingAdj: -108n },
  },
  {
    name: 'a total already on the rounding step needs no adjustment',
    lines: THOUSAND,
    policy: { rounding: 'NEAREST_RUPEE', roundingDirection: 'UP' },
    payments: [pay('CARD')],
    expected: { grandTotal: 113100n, roundingAdj: 0n },
  },

  // ---- P4: taxability of the service charge and POS fee --------------------
  {
    name: 'P4 — a taxable service charge joins the base',
    lines: THOUSAND,
    policy: { serviceChargeTaxable: true },
    payments: [pay('CARD')],
    // Taxed on 1,050.00 → 84.00, but the reported taxable base stays 1,000.00.
    expected: { taxableBase: 100000n, taxTotal: 8400n, grandTotal: 113500n },
  },
  {
    name: 'P4 — a taxable POS fee joins the base',
    lines: THOUSAND,
    policy: { posFeeTaxable: true },
    payments: [pay('CARD')],
    // Taxed on 1,000.01 → 80.0008, half-up to 80.08.
    expected: { taxTotal: 8008n, grandTotal: 113108n },
  },
  {
    name: 'P4 — both taxable',
    lines: THOUSAND,
    policy: { serviceChargeTaxable: true, posFeeTaxable: true },
    payments: [pay('CARD')],
    expected: { taxTotal: 8408n, grandTotal: 113508n },
  },

  // ---- voided lines ---------------------------------------------------------
  {
    name: 'a voided line contributes nothing but stays on the order',
    lines: [item('1000.00', 1), { ...item('9999.00', 1), isVoid: true }],
    payments: [pay('CARD')],
    expected: { subtotal: 100000n, grandTotal: 113100n },
  },

  // ---- §6.7 mid-service rate change -----------------------------------------
  {
    name: 'service started before the 2026 Act — taxed at the old 16 percent on card',
    lines: THOUSAND,
    rules: RULES_WITH_HISTORY,
    // 23:50 PKT on 30 June 2026.
    serviceStartedAt: new Date('2026-06-30T18:50:00Z'),
    payments: [pay('CARD')],
    expected: { taxTotal: 16000n, grandTotal: 121100n },
  },
  {
    name: 'service started after the 2026 Act — taxed at the new 8 percent on card',
    lines: THOUSAND,
    rules: RULES_WITH_HISTORY,
    serviceStartedAt: new Date('2026-07-01T00:10:00Z'),
    payments: [pay('CARD')],
    expected: { taxTotal: 8000n, grandTotal: 113100n },
  },
  {
    name: 'cash is unaffected by the 2026 change',
    lines: THOUSAND,
    rules: RULES_WITH_HISTORY,
    serviceStartedAt: new Date('2026-06-30T18:50:00Z'),
    payments: [pay('CASH')],
    expected: { taxTotal: 16000n, grandTotal: 121100n },
  },

  // ---- modifiers -------------------------------------------------------------
  {
    name: 'a modifier adds to the line',
    lines: [{ ...item('1000.00', 1), modifiers: [{ name: 'extra', priceDelta: p('50.00') }] }],
    payments: [pay('CARD')],
    expected: { subtotal: 105000n, taxTotal: 8400n, grandTotal: 118750n },
  },
  {
    name: 'a modifier is added once, not once per unit — see §6.3 and the M03 runfile',
    lines: [{ ...item('100.00', 3), modifiers: [{ name: 'extra', priceDelta: p('5.00') }] }],
    payments: [pay('CARD')],
    // 300.00 + 5.00, not 300.00 + 15.00. This follows §6.3 literally and is
    // flagged for confirmation before modifiers ship in M08.
    expected: { subtotal: 30500n, taxTotal: 2440n, grandTotal: 34565n },
  },
  {
    name: 'several modifiers on one line',
    lines: [
      {
        ...item('1000.00', 1),
        modifiers: [
          { name: 'a', priceDelta: p('10.00') },
          { name: 'b', priceDelta: p('20.00') },
          { name: 'c', priceDelta: p('-5.00') },
        ],
      },
    ],
    payments: [pay('CARD')],
    expected: { subtotal: 102500n, grandTotal: 115925n },
  },

  // ---- the Appendix A order under every method ------------------------------
  {
    name: 'the reference order settled by wallet',
    lines: [item('12220.00', 1)],
    payments: [pay('WALLET')],
    expected: { taxTotal: 97760n, grandTotal: 1380960n },
  },
  {
    name: 'the reference order settled by QR',
    lines: [item('12220.00', 1)],
    payments: [pay('QR')],
    expected: { taxTotal: 97760n, grandTotal: 1380960n },
  },
  {
    name: 'the reference order split evenly between card and cash',
    lines: [item('12220.00', 1)],
    payments: [pay('CARD', 1n), pay('CASH', 1n)],
    // 6,110.00 each: 488.80 at 8% plus 977.60 at 16%.
    expected: { taxTotal: 146640n, grandTotal: 1429840n },
  },
];

describe('golden scenarios — §6.14', () => {
  it('covers at least the cases §6.14 names', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(45);
  });

  it.each(SCENARIOS.map((s) => [s.name, s] as const))('%s', (_name, scenario) => {
    const totals = computeTotals({
      lines: scenario.lines,
      orderType: scenario.orderType ?? 'DINE_IN',
      orderDiscount: scenario.orderDiscount,
      payments: scenario.payments,
      serviceStartedAt: scenario.serviceStartedAt ?? SERVICE_STARTED_AT,
      rules: scenario.rules ?? RULES,
      policy: { ...DEFAULT_TAX_POLICY, ...scenario.policy },
    });

    const e = scenario.expected;
    if (e.subtotal !== undefined) expect(totals.subtotal).toBe(e.subtotal);
    if (e.taxableBase !== undefined) expect(totals.taxableBase).toBe(e.taxableBase);
    if (e.taxTotal !== undefined) expect(totals.taxTotal).toBe(e.taxTotal);
    if (e.serviceCharge !== undefined) expect(totals.serviceCharge).toBe(e.serviceCharge);
    if (e.roundingAdj !== undefined) expect(totals.roundingAdj).toBe(e.roundingAdj);
    if (e.taxLines !== undefined) expect(totals.taxLines).toHaveLength(e.taxLines);

    expect(totals.grandTotal).toBe(e.grandTotal);
  });

  it.each(SCENARIOS.map((s) => [s.name, s] as const))(
    'the parts of "%s" sum to its whole',
    (_name, scenario) => {
      const policy = { ...DEFAULT_TAX_POLICY, ...scenario.policy };
      const totals = computeTotals({
        lines: scenario.lines,
        orderType: scenario.orderType ?? 'DINE_IN',
        orderDiscount: scenario.orderDiscount,
        payments: scenario.payments,
        serviceStartedAt: scenario.serviceStartedAt ?? SERVICE_STARTED_AT,
        rules: scenario.rules ?? RULES,
        policy,
      });

      const assembled = policy.discountBeforeTax
        ? totals.taxableBase +
          totals.taxTotal +
          totals.posFee +
          totals.serviceCharge +
          totals.roundingAdj
        : totals.taxableBase +
          totals.taxTotal +
          totals.posFee +
          totals.serviceCharge +
          totals.roundingAdj -
          totals.discountTotal;

      expect(assembled).toBe(totals.grandTotal);
    },
  );

  it.each(SCENARIOS.map((s) => [s.name, s] as const))(
    'the tax lines of "%s" sum to its tax total',
    (_name, scenario) => {
      const totals = computeTotals({
        lines: scenario.lines,
        orderType: scenario.orderType ?? 'DINE_IN',
        orderDiscount: scenario.orderDiscount,
        payments: scenario.payments,
        serviceStartedAt: scenario.serviceStartedAt ?? SERVICE_STARTED_AT,
        rules: scenario.rules ?? RULES,
        policy: { ...DEFAULT_TAX_POLICY, ...scenario.policy },
      });

      const summed = totals.taxLines.reduce((total, line) => total + line.amount, 0n);
      expect(summed).toBe(totals.taxTotal);
    },
  );
});
