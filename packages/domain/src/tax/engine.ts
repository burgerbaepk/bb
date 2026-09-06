import {
  add,
  applyBps,
  divideHalfUp,
  paisa,
  subtract,
  sum,
  ZERO,
  type Paisa,
} from '../money/paisa';
import {
  linesDiscountTotal,
  linesSubtotal,
  priceLines,
  type OrderLine,
  type PricedLine,
} from '../pricing/lines';
import { allocateProportionally } from './allocate';
import type { OrderType, PaymentMethod, RoundingMode, TaxClassKey, TaxPolicy } from './policy';
import { resolveRate, type TaxRule } from './rates';

/**
 * The tax engine — BUILD-PLAN.md §6.3, §6.6, §6.7, §6.10.
 *
 * §6.3 fixes the order of operations, and the order is not negotiable:
 *
 *     Line subtotal            12,220.00    Σ(qty × unit_price) + modifier deltas
 *     Order discount                0.00
 *     ─────────────────────────────────
 *     Taxable base             12,220.00
 *     Sales tax @ 8% (card)       977.60    base × 800 bps
 *     POS service fee               1.00    fixed, per invoice
 *     Service charge @ 5%         611.00    base × 500 bps, not taxed
 *     ─────────────────────────────────
 *     Grand total              13,809.60
 *
 * Both the check estimator and the finalize path call `computeTotals`. They
 * differ only in what payment mix they hand it: the estimator supplies one
 * hypothetical payment per rate it wants to show, and finalize supplies the
 * payments actually taken. A golden fixture asserts the two agree to the paisa.
 */

export interface PaymentSlice {
  readonly method: PaymentMethod;
  /** What was tendered against this method. Weights the proportional split. */
  readonly amount: Paisa;
}

export interface ComputeInput {
  readonly lines: readonly OrderLine[];
  readonly orderType: OrderType;
  readonly orderDiscount?: Paisa | undefined;
  readonly deliveryCharge?: Paisa | undefined;
  /** §6.6 — one entry per method. Declined attempts are excluded by the caller. */
  readonly payments: readonly PaymentSlice[];
  /** §6.7 — PSTSA s.13. Never the finalize time. */
  readonly serviceStartedAt: Date;
  readonly rules: readonly TaxRule[];
  readonly policy: TaxPolicy;
}

export interface TaxLineResult {
  readonly taxClass: TaxClassKey;
  readonly rateBps: number;
  readonly base: Paisa;
  readonly amount: Paisa;
  readonly paymentMethodScope: PaymentMethod;
  readonly legalReference?: string | undefined;
}

export interface Totals {
  /** Σ line gross, before any discount. */
  readonly subtotal: Paisa;
  readonly discountTotal: Paisa;
  /** §6.3 — subtotal less discount. The figure the rate is applied to. */
  readonly taxableBase: Paisa;
  readonly taxTotal: Paisa;
  readonly deliveryCharge?: Paisa;
  readonly serviceCharge: Paisa;
  readonly posFee: Paisa;
  readonly roundingAdj: Paisa;
  readonly grandTotal: Paisa;
  readonly taxLines: readonly TaxLineResult[];
  readonly pricedLines: readonly PricedLine[];
}

export class EmptyOrderError extends Error {
  constructor() {
    // Defect C1: the system this replaces shows Grand Total Rs. 1 on an empty
    // cart with finalize enabled — the POS fee, charged for nothing.
    super('An order with no priceable lines cannot be checked or finalized.');
    this.name = 'EmptyOrderError';
  }
}

const RUPEE = 100n;
const FIVE_RUPEES = 500n;

function roundingStep(mode: RoundingMode): bigint {
  switch (mode) {
    case 'NONE':
      return 0n;
    case 'NEAREST_RUPEE':
      return RUPEE;
    case 'NEAREST_5_RUPEE':
      return FIVE_RUPEES;
    default: {
      const exhaustive: never = mode;
      throw new TypeError(`unknown rounding mode ${String(exhaustive)}`);
    }
  }
}

function roundTotal(total: Paisa, policy: TaxPolicy): Paisa {
  const step = roundingStep(policy.rounding);
  if (step === 0n) return total;

  switch (policy.roundingDirection) {
    case 'HALF_UP':
      return paisa(divideHalfUp(total, step) * step);
    case 'UP': {
      const remainder = total % step;
      return remainder === 0n ? total : paisa(total + (step - remainder));
    }
    case 'DOWN':
      return paisa(total - (total % step));
    default: {
      const exhaustive: never = policy.roundingDirection;
      throw new TypeError(`unknown rounding direction ${String(exhaustive)}`);
    }
  }
}

/** Group the priced lines by tax class, preserving first-seen order. */
function basesByClass(priced: readonly PricedLine[]): Map<TaxClassKey, Paisa> {
  const bases = new Map<TaxClassKey, Paisa>();
  for (const p of priced) {
    const key = p.line.taxClass;
    bases.set(key, add(bases.get(key) ?? ZERO, p.net));
  }
  return bases;
}

export function computeTotals(input: ComputeInput): Totals {
  const priced = priceLines(input.lines);

  const priceable = priced.filter((p) => p.line.isVoid !== true);
  if (priceable.length === 0) throw new EmptyOrderError();

  const subtotal = linesSubtotal(priced);
  const orderDiscount = input.orderDiscount ?? ZERO;
  const discountTotal = add(linesDiscountTotal(priced), orderDiscount);

  // §6.8 discountBeforeTax. When false the discount comes off after tax, so the
  // taxable base is the undiscounted subtotal.
  const taxableBase = input.policy.discountBeforeTax ? subtract(subtotal, discountTotal) : subtotal;

  // §6.8 — the service charge applies only to the order types listed, and is
  // computed on the taxable base, not the grand total.
  const serviceCharge = input.policy.serviceChargeAppliesTo.includes(input.orderType)
    ? applyBps(taxableBase, input.policy.serviceChargeBps)
    : ZERO;

  const requestedDeliveryCharge = input.deliveryCharge ?? ZERO;
  if (requestedDeliveryCharge < 0n || requestedDeliveryCharge > 100000000n) {
    throw new RangeError('Delivery charge must be between Rs. 0 and Rs. 1,000,000.');
  }
  const deliveryCharge = input.orderType === 'DELIVERY' ? requestedDeliveryCharge : ZERO;
  const posFee = input.policy.posFeePaisa;

  // Spread the order-level discount across tax classes in proportion to each
  // class's share, so a discount on a mixed order does not fall entirely on the
  // exempt lines and understate the tax.
  const classNets = basesByClass(priced);
  const classKeys = [...classNets.keys()];
  // Keys come from this very map, so the lookup cannot miss.
  const classWeights = classKeys.map((key) => classNets.get(key) as Paisa);
  const discountShares = input.policy.discountBeforeTax
    ? allocateProportionally(orderDiscount, classWeights)
    : classKeys.map(() => ZERO);

  // P4 — both default to false. If an advisor rules that either is part of the
  // value of the service under s.7(1), it joins the base that gets taxed.
  const taxableExtras = add(
    input.policy.serviceChargeTaxable ? serviceCharge : ZERO,
    input.policy.posFeeTaxable ? posFee : ZERO,
  );

  const paymentWeights = input.payments.map((payment) => payment.amount);
  const taxLines: TaxLineResult[] = [];

  (input.policy.taxEnabled ? classKeys : []).forEach((taxClass, classIndex) => {
    const classBase = subtract(
      classWeights[classIndex] as Paisa,
      discountShares[classIndex] as Paisa,
    );

    // Extras attach to the first class rather than being spread: they are a
    // single charge on the order, not something each line contributes to.
    const withExtras = classIndex === 0 ? add(classBase, taxableExtras) : classBase;

    // §6.6 — split the class base across the payment methods in proportion to
    // what was tendered against each.
    const slices = allocateProportionally(withExtras, paymentWeights);

    input.payments.forEach((payment, paymentIndex) => {
      const sliceBase = slices[paymentIndex] as Paisa;
      const rate = resolveRate(input.rules, taxClass, payment.method, input.serviceStartedAt);

      taxLines.push({
        taxClass,
        rateBps: rate.rateBps,
        base: sliceBase,
        // §6.10 — this is the single point at which rounding happens.
        amount: applyBps(sliceBase, rate.rateBps),
        paymentMethodScope: payment.method,
        legalReference: rate.legalReference,
      });
    });
  });

  const taxTotal = sum(taxLines.map((line) => line.amount));

  const beforeRounding = input.policy.discountBeforeTax
    ? add(taxableBase, taxTotal, posFee, serviceCharge, deliveryCharge)
    : subtract(add(taxableBase, taxTotal, posFee, serviceCharge, deliveryCharge), discountTotal);

  const grandTotal = roundTotal(beforeRounding, input.policy);
  const roundingAdj = subtract(grandTotal, beforeRounding);

  return {
    subtotal,
    discountTotal,
    taxableBase,
    taxTotal,
    serviceCharge,
    deliveryCharge,
    posFee,
    roundingAdj,
    grandTotal,
    taxLines,
    pricedLines: priced,
  };
}
