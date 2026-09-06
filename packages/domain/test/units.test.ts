import { describe, expect, it } from 'vitest';
import {
  ZERO,
  absolute,
  add,
  applyBps,
  divideHalfUp,
  isNegative,
  isZero,
  max,
  min,
  negate,
  paisa,
  parsePaisa,
  subtract,
  sum,
} from '../src/money/paisa';
import { ONE, extend, parseQty, qty, qtyToString, whole } from '../src/money/quantity';
import { allocateProportionally } from '../src/tax/allocate';
import { NoApplicableRateError, resolveRate, type TaxRule } from '../src/tax/rates';
import { EmptyOrderError, computeTotals } from '../src/tax/engine';
import { buildTaxSnapshot, ENGINE_VERSION } from '../src/tax/snapshot';
import { DEFAULT_TAX_POLICY, type RoundingDirection, type RoundingMode } from '../src/tax/policy';
import { priceLine, linesSubtotal, linesDiscountTotal } from '../src/pricing/lines';
import { RULES, SERVICE_STARTED_AT } from './fixtures';

describe('R1 — paisa arithmetic', () => {
  it('adds, sums, and subtracts', () => {
    expect(add(paisa(100n), paisa(250n))).toBe(350n);
    expect(add()).toBe(0n);
    expect(sum([paisa(1n), paisa(2n), paisa(3n)])).toBe(6n);
    expect(sum([])).toBe(0n);
    expect(subtract(paisa(500n), paisa(200n))).toBe(300n);
  });

  it('negates, takes magnitude, and compares', () => {
    expect(negate(paisa(100n))).toBe(-100n);
    expect(absolute(paisa(-100n))).toBe(100n);
    expect(absolute(paisa(100n))).toBe(100n);
    expect(isNegative(paisa(-1n))).toBe(true);
    expect(isNegative(paisa(0n))).toBe(false);
    expect(isZero(ZERO)).toBe(true);
    expect(isZero(paisa(1n))).toBe(false);
    expect(max(paisa(1n), paisa(2n))).toBe(2n);
    expect(max(paisa(2n), paisa(1n))).toBe(2n);
    expect(min(paisa(1n), paisa(2n))).toBe(1n);
    expect(min(paisa(2n), paisa(1n))).toBe(1n);
  });

  it('rounds half away from zero, in both directions', () => {
    expect(divideHalfUp(5n, 2n)).toBe(3n); // 2.5 → 3
    expect(divideHalfUp(-5n, 2n)).toBe(-3n); // −2.5 → −3, not −2
    expect(divideHalfUp(4n, 2n)).toBe(2n);
    expect(divideHalfUp(3n, 2n)).toBe(2n); // 1.5 → 2
    expect(divideHalfUp(1n, 2n)).toBe(1n); // 0.5 → 1
    expect(divideHalfUp(-1n, 2n)).toBe(-1n);
    expect(divideHalfUp(1n, -2n)).toBe(-1n);
    expect(divideHalfUp(-1n, -2n)).toBe(1n);
    expect(divideHalfUp(0n, 5n)).toBe(0n);
  });

  it('refuses to divide by zero rather than returning something', () => {
    expect(() => divideHalfUp(1n, 0n)).toThrow(RangeError);
  });

  it('applies basis points', () => {
    expect(applyBps(paisa(1222000n), 800)).toBe(97760n);
    expect(applyBps(paisa(1222000n), 1600)).toBe(195520n);
    expect(applyBps(paisa(100000n), 0)).toBe(0n);
    expect(applyBps(paisa(-100000n), 800)).toBe(-8000n);
  });

  it('refuses a fractional basis-point rate', () => {
    // A rate is an integer count of basis points (§5.10). A float here would be
    // the exact thing R1 exists to prevent.
    expect(() => applyBps(paisa(100n), 8.5)).toThrow(TypeError);
  });

  it('parses money without touching a float', () => {
    expect(parsePaisa('530.00')).toBe(53000n);
    expect(parsePaisa('530')).toBe(53000n);
    expect(parsePaisa('530.5')).toBe(53050n);
    expect(parsePaisa('0.01')).toBe(1n);
    expect(parsePaisa('0')).toBe(0n);
    expect(parsePaisa('-13809.60')).toBe(-1380960n);
    expect(parsePaisa('  12220.00  ')).toBe(1222000n);
    // 530.07 through parseFloat is 530.0699999999999.
    expect(parsePaisa('530.07')).toBe(53007n);
  });

  it('refuses input that is not a money amount', () => {
    for (const bad of ['', 'abc', '1.234', '1,000.00', '1.', '.5', 'NaN', '1e3']) {
      expect(() => parsePaisa(bad)).toThrow(TypeError);
    }
  });
});

describe('quantity', () => {
  it('builds whole quantities', () => {
    expect(whole(4)).toBe(4000n);
    expect(whole(0)).toBe(0n);
    expect(ONE).toBe(1000n);
    expect(qty(1500n)).toBe(1500n);
  });

  it('refuses a fractional argument to whole()', () => {
    expect(() => whole(0.5)).toThrow(TypeError);
  });

  it('parses three decimal places', () => {
    expect(parseQty('4')).toBe(4000n);
    expect(parseQty('0.5')).toBe(500n);
    expect(parseQty('1.250')).toBe(1250n);
    expect(parseQty('0.001')).toBe(1n);
    expect(parseQty('999')).toBe(999000n);
    expect(parseQty('-2')).toBe(-2000n);
    expect(parseQty(' 3 ')).toBe(3000n);
  });

  it('refuses input that is not a quantity', () => {
    for (const bad of ['', 'x', '1.2345', '1,5', '.5']) {
      expect(() => parseQty(bad)).toThrow(TypeError);
    }
  });

  it('round-trips to the numeric(10,3) string form', () => {
    expect(qtyToString(whole(4))).toBe('4.000');
    expect(qtyToString(parseQty('0.5'))).toBe('0.500');
    expect(qtyToString(parseQty('1.250'))).toBe('1.250');
    expect(qtyToString(parseQty('-2.5'))).toBe('-2.500');
    expect(qtyToString(qty(0n))).toBe('0.000');
  });

  it('extends a unit price across a quantity', () => {
    expect(extend(paisa(53000n), whole(4))).toBe(212000n);
    expect(extend(paisa(53000n), parseQty('0.5'))).toBe(26500n);
    // 33333 × 0.333 = 11,099.889 paisa, half-up to 11,100.
    expect(extend(paisa(33333n), parseQty('0.333'))).toBe(11100n);
    expect(extend(paisa(0n), whole(999))).toBe(0n);
  });
});

describe('§6.6 — proportional allocation', () => {
  it('returns nothing for no slices', () => {
    expect(allocateProportionally(paisa(100n), [])).toEqual([]);
  });

  it('gives everything to a single slice', () => {
    expect(allocateProportionally(paisa(100n), [paisa(1n)])).toEqual([100n]);
  });

  it('splits in proportion', () => {
    expect(allocateProportionally(paisa(1000n), [paisa(600n), paisa(400n)])).toEqual([600n, 400n]);
  });

  it('always sums back to the total, whatever the remainder', () => {
    for (let total = 0n; total < 200n; total += 7n) {
      for (const weights of [
        [paisa(1n), paisa(1n), paisa(1n)],
        [paisa(1n), paisa(2n)],
        [paisa(5n), paisa(3n), paisa(2n), paisa(1n)],
      ]) {
        const shares = allocateProportionally(paisa(total), weights);
        expect(shares.reduce((a, b) => a + b, 0n)).toBe(total);
      }
    }
  });

  it('puts the residual on the largest weight', () => {
    // 10 split 1:3 rounds to 3 and 8, which is 11 — one too many. The residual
    // comes off the larger share, so the parts sum back to 10.
    expect(allocateProportionally(paisa(10n), [paisa(1n), paisa(3n)])).toEqual([3n, 7n]);
    // And the mirror image, so the loop is exercised in both orders.
    expect(allocateProportionally(paisa(10n), [paisa(3n), paisa(1n)])).toEqual([7n, 3n]);
  });

  it('splits evenly when the division is exact', () => {
    expect(allocateProportionally(paisa(100n), [paisa(1n), paisa(2n)])).toEqual([33n, 67n]);
  });

  it('handles zero weights without dividing by zero', () => {
    // No payments recorded yet, or a zero-value order.
    expect(allocateProportionally(paisa(100n), [paisa(0n), paisa(0n)])).toEqual([100n, 0n]);
  });

  it('allocates a negative total, as a credit note would', () => {
    const shares = allocateProportionally(paisa(-100n), [paisa(1n), paisa(1n)]);
    expect(shares.reduce((a, b) => a + b, 0n)).toBe(-100n);
  });
});

describe('§6.7 — rate resolution', () => {
  it('prefers a method-specific rule over a method-agnostic one', () => {
    const rules: TaxRule[] = [
      {
        taxClass: 'STANDARD_FOOD',
        paymentMethod: null,
        rateBps: 1600,
        effectiveFrom: new Date('2012-07-01T00:00:00Z'),
      },
      {
        taxClass: 'STANDARD_FOOD',
        paymentMethod: 'CARD',
        rateBps: 800,
        effectiveFrom: new Date('2012-07-01T00:00:00Z'),
      },
    ];
    expect(resolveRate(rules, 'STANDARD_FOOD', 'CARD', SERVICE_STARTED_AT).rateBps).toBe(800);
    expect(resolveRate(rules, 'STANDARD_FOOD', 'CASH', SERVICE_STARTED_AT).rateBps).toBe(1600);
  });

  it('prefers the most recently effective among equals', () => {
    const rules: TaxRule[] = [
      {
        taxClass: 'STANDARD_FOOD',
        paymentMethod: 'CARD',
        rateBps: 1600,
        effectiveFrom: new Date('2012-07-01T00:00:00Z'),
      },
      {
        taxClass: 'STANDARD_FOOD',
        paymentMethod: 'CARD',
        rateBps: 800,
        effectiveFrom: new Date('2026-07-01T00:00:00Z'),
      },
    ];
    expect(resolveRate(rules, 'STANDARD_FOOD', 'CARD', SERVICE_STARTED_AT).rateBps).toBe(800);
  });

  it('ignores a rule that has expired', () => {
    const rules: TaxRule[] = [
      {
        taxClass: 'STANDARD_FOOD',
        paymentMethod: 'CARD',
        rateBps: 1600,
        effectiveFrom: new Date('2012-07-01T00:00:00Z'),
        effectiveTo: new Date('2026-07-01T00:00:00Z'),
      },
      {
        taxClass: 'STANDARD_FOOD',
        paymentMethod: 'CARD',
        rateBps: 800,
        effectiveFrom: new Date('2026-07-01T00:00:00Z'),
        effectiveTo: null,
      },
    ];
    expect(resolveRate(rules, 'STANDARD_FOOD', 'CARD', SERVICE_STARTED_AT).rateBps).toBe(800);
  });

  it('ignores a rule that is not yet in force', () => {
    const rules: TaxRule[] = [
      {
        taxClass: 'STANDARD_FOOD',
        paymentMethod: 'CARD',
        rateBps: 800,
        effectiveFrom: new Date('2030-01-01T00:00:00Z'),
      },
      {
        taxClass: 'STANDARD_FOOD',
        paymentMethod: 'CARD',
        rateBps: 1600,
        effectiveFrom: new Date('2012-07-01T00:00:00Z'),
      },
    ];
    expect(resolveRate(rules, 'STANDARD_FOOD', 'CARD', SERVICE_STARTED_AT).rateBps).toBe(1600);
  });

  it('carries the legal reference through', () => {
    const resolved = resolveRate(RULES, 'STANDARD_FOOD', 'CARD', SERVICE_STARTED_AT);
    expect(resolved.legalReference).toBe('Punjab Finance Act 2026');
    expect(resolved.taxClass).toBe('STANDARD_FOOD');
    expect(resolved.paymentMethod).toBe('CARD');
  });

  it('refuses to price a sale with no applicable rate', () => {
    // Better to stop than to invent a rate and file the result.
    expect(() => resolveRate([], 'STANDARD_FOOD', 'CARD', SERVICE_STARTED_AT)).toThrow(
      NoApplicableRateError,
    );
    expect(() => resolveRate([], 'STANDARD_FOOD', 'CARD', SERVICE_STARTED_AT)).toThrow(
      /cannot be priced without a rate/,
    );
  });
});

describe('line pricing', () => {
  const line = {
    id: 'l1',
    name: 'x',
    taxClass: 'STANDARD_FOOD' as const,
    unitPrice: paisa(53000n),
    qty: whole(4),
  };

  it('prices a plain line', () => {
    const priced = priceLine(line);
    expect(priced.extended).toBe(212000n);
    expect(priced.modifierTotal).toBe(0n);
    expect(priced.gross).toBe(212000n);
    expect(priced.lineDiscount).toBe(0n);
    expect(priced.net).toBe(212000n);
  });

  it('zeroes a voided line entirely', () => {
    const priced = priceLine({ ...line, isVoid: true, lineDiscount: paisa(999n) });
    expect(priced.gross).toBe(0n);
    expect(priced.net).toBe(0n);
    expect(priced.extended).toBe(0n);
    expect(priced.modifierTotal).toBe(0n);
    expect(priced.lineDiscount).toBe(0n);
  });

  it('sums subtotals and discounts across lines', () => {
    const priced = [priceLine(line), priceLine({ ...line, lineDiscount: paisa(1000n) })];
    expect(linesSubtotal(priced)).toBe(424000n);
    expect(linesDiscountTotal(priced)).toBe(1000n);
  });
});

describe('the engine refuses what it cannot price', () => {
  it('omits every tax line when the outlet tax switch is off', () => {
    const totals = computeTotals({
      lines: [
        { id: 'l1', name: 'Burger', taxClass: 'STANDARD_FOOD', unitPrice: paisa(10000n), qty: ONE },
      ],
      orderType: 'TAKE_AWAY',
      payments: [{ method: 'CASH', amount: ZERO }],
      serviceStartedAt: SERVICE_STARTED_AT,
      rules: RULES,
      policy: { ...DEFAULT_TAX_POLICY, taxEnabled: false, posFeePaisa: ZERO },
    });

    expect(totals.taxLines).toEqual([]);
    expect(totals.taxTotal).toBe(0n);
    expect(totals.grandTotal).toBe(10000n);
  });

  it('rejects an order with no lines (defect C1)', () => {
    // The system this replaces shows Grand Total Rs. 1 on an empty cart with
    // finalize enabled — the POS fee, charged for nothing.
    expect(() =>
      computeTotals({
        lines: [],
        orderType: 'DINE_IN',
        payments: [{ method: 'CARD', amount: ZERO }],
        serviceStartedAt: SERVICE_STARTED_AT,
        rules: RULES,
        policy: DEFAULT_TAX_POLICY,
      }),
    ).toThrow(EmptyOrderError);
  });

  it('rejects an order whose every line is void', () => {
    expect(() =>
      computeTotals({
        lines: [
          {
            id: 'l1',
            name: 'x',
            taxClass: 'STANDARD_FOOD',
            unitPrice: paisa(100n),
            qty: ONE,
            isVoid: true,
          },
        ],
        orderType: 'DINE_IN',
        payments: [{ method: 'CARD', amount: ZERO }],
        serviceStartedAt: SERVICE_STARTED_AT,
        rules: RULES,
        policy: DEFAULT_TAX_POLICY,
      }),
    ).toThrow(EmptyOrderError);
  });

  it('rejects an unknown rounding mode rather than silently not rounding', () => {
    expect(() =>
      computeTotals({
        lines: [
          { id: 'l1', name: 'x', taxClass: 'STANDARD_FOOD', unitPrice: paisa(100n), qty: ONE },
        ],
        orderType: 'DINE_IN',
        payments: [{ method: 'CARD', amount: ZERO }],
        serviceStartedAt: SERVICE_STARTED_AT,
        rules: RULES,
        policy: { ...DEFAULT_TAX_POLICY, rounding: 'NEAREST_10_RUPEE' as RoundingMode },
      }),
    ).toThrow(/unknown rounding mode/);
  });

  it('rejects an unknown rounding direction', () => {
    expect(() =>
      computeTotals({
        lines: [
          { id: 'l1', name: 'x', taxClass: 'STANDARD_FOOD', unitPrice: paisa(100n), qty: ONE },
        ],
        orderType: 'DINE_IN',
        payments: [{ method: 'CARD', amount: ZERO }],
        serviceStartedAt: SERVICE_STARTED_AT,
        rules: RULES,
        policy: {
          ...DEFAULT_TAX_POLICY,
          rounding: 'NEAREST_RUPEE',
          roundingDirection: 'BANKERS' as RoundingDirection,
        },
      }),
    ).toThrow(/unknown rounding direction/);
  });
});

describe('§6.12 — the tax snapshot', () => {
  const totals = computeTotals({
    lines: [
      { id: 'l1', name: 'x', taxClass: 'STANDARD_FOOD', unitPrice: paisa(1222000n), qty: ONE },
    ],
    orderType: 'DINE_IN',
    payments: [{ method: 'CARD', amount: ZERO }],
    serviceStartedAt: SERVICE_STARTED_AT,
    rules: RULES,
    policy: DEFAULT_TAX_POLICY,
  });

  const resolvedAt = new Date('2026-08-22T09:13:07Z');
  const snapshot = buildTaxSnapshot(totals, DEFAULT_TAX_POLICY, SERVICE_STARTED_AT, resolvedAt);

  it('records the engine version', () => {
    expect(snapshot.engineVersion).toBe(ENGINE_VERSION);
  });

  it('records that the rate was resolved against service start, not finalize', () => {
    expect(snapshot.resolvedAgainst).toBe('service_started_at');
    expect(snapshot.serviceStartedAt).toBe(SERVICE_STARTED_AT.toISOString());
    expect(snapshot.resolvedAt).toBe(resolvedAt.toISOString());
  });

  it('records the rule actually applied, with its legal reference', () => {
    expect(snapshot.rules).toEqual([
      {
        class: 'STANDARD_FOOD',
        method: 'CARD',
        rateBps: 800,
        effectiveFrom: SERVICE_STARTED_AT.toISOString(),
        legalRef: 'Punjab Finance Act 2026',
      },
    ]);
  });

  it('deduplicates repeated rules across tax lines', () => {
    const split = computeTotals({
      lines: [
        { id: 'l1', name: 'a', taxClass: 'STANDARD_FOOD', unitPrice: paisa(100000n), qty: ONE },
        { id: 'l2', name: 'b', taxClass: 'STANDARD_FOOD', unitPrice: paisa(100000n), qty: ONE },
      ],
      orderType: 'DINE_IN',
      payments: [
        { method: 'CARD', amount: paisa(1n) },
        { method: 'CASH', amount: paisa(1n) },
      ],
      serviceStartedAt: SERVICE_STARTED_AT,
      rules: RULES,
      policy: DEFAULT_TAX_POLICY,
    });
    const snap = buildTaxSnapshot(split, DEFAULT_TAX_POLICY, SERVICE_STARTED_AT, resolvedAt);
    // Two tax lines, one per method, but each rule appears once.
    expect(split.taxLines).toHaveLength(2);
    expect(snap.rules).toHaveLength(2);
  });

  it('deduplicates two payments of the same method into one rule', () => {
    // Two card payments produce two tax lines that share class, method, and
    // rate. The snapshot records the rule once.
    const twoCards = computeTotals({
      lines: [
        { id: 'l1', name: 'x', taxClass: 'STANDARD_FOOD', unitPrice: paisa(100000n), qty: ONE },
      ],
      orderType: 'DINE_IN',
      payments: [
        { method: 'CARD', amount: paisa(50000n) },
        { method: 'CARD', amount: paisa(50000n) },
      ],
      serviceStartedAt: SERVICE_STARTED_AT,
      rules: RULES,
      policy: DEFAULT_TAX_POLICY,
    });
    const snap = buildTaxSnapshot(twoCards, DEFAULT_TAX_POLICY, SERVICE_STARTED_AT, resolvedAt);
    expect(twoCards.taxLines).toHaveLength(2);
    expect(snap.rules).toHaveLength(1);
  });

  it('holds the POS fee as a string, because JSON has no bigint', () => {
    expect(snapshot.policy.posFeePaisa).toBe('100');
    expect(snapshot.policy.serviceChargeBps).toBe(500);
    expect(snapshot.policy.serviceChargeTaxable).toBe(false);
    expect(snapshot.policy.splitPaymentTaxPolicy).toBe('PROPORTIONAL');
    expect(snapshot.policy.discountBeforeTax).toBe(true);
    expect(snapshot.policy.rounding).toBe('NONE');
    expect(snapshot.policy.roundingDirection).toBe('HALF_UP');
  });

  it('survives a JSON round trip, which is how it is persisted', () => {
    const parsed = JSON.parse(JSON.stringify(snapshot)) as typeof snapshot;
    expect(parsed).toEqual(snapshot);
  });
});
