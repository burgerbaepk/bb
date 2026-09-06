import type { PaymentMethod, TaxClassKey } from './policy';

/**
 * Rate resolution — BUILD-PLAN.md §6.7, §5.10.
 *
 * PSTSA 2012 s.13 charges tax at the rate in force **when the service was
 * provided**, not when it was paid for. So rules resolve against
 * `orders.service_started_at`, never `invoices.finalized_at`.
 *
 * The case this exists for is real and dated: an order opened at 23:50 on
 * 30 June and settled at 00:10 on 1 July, across the rate change introduced by
 * the Punjab Finance Act 2026. Resolving at finalize would tax it at the new
 * rate and misstate the return.
 */

export interface TaxRule {
  readonly taxClass: TaxClassKey;
  /** Null means the rule applies regardless of how the customer pays. */
  readonly paymentMethod: PaymentMethod | null;
  readonly rateBps: number;
  readonly effectiveFrom: Date;
  readonly effectiveTo?: Date | null | undefined;
  readonly legalReference?: string | undefined;
}

export interface ResolvedRate {
  readonly taxClass: TaxClassKey;
  readonly paymentMethod: PaymentMethod;
  readonly rateBps: number;
  readonly effectiveFrom: Date;
  readonly legalReference?: string | undefined;
}

export class NoApplicableRateError extends Error {
  constructor(taxClass: TaxClassKey, method: PaymentMethod, at: Date) {
    super(
      `No tax rule for class ${taxClass} and method ${method} in force at ${at.toISOString()}. ` +
        `A sale cannot be priced without a rate; seed tax_rules before trading.`,
    );
    this.name = 'NoApplicableRateError';
  }
}

function isInForce(rule: TaxRule, at: Date): boolean {
  if (rule.effectiveFrom.getTime() > at.getTime()) return false;
  const until = rule.effectiveTo;
  if (until === null || until === undefined) return true;
  return until.getTime() > at.getTime();
}

/**
 * Resolve the rate for one class and payment method at a point in time.
 *
 * A method-specific rule beats a method-agnostic one, and among equals the most
 * recently effective wins. That ordering matters: EXEMPT carries a
 * method-agnostic rule at 0 bps, and a standard-rate rule must never be allowed
 * to shadow it.
 */
export function resolveRate(
  rules: readonly TaxRule[],
  taxClass: TaxClassKey,
  method: PaymentMethod,
  serviceStartedAt: Date,
): ResolvedRate {
  const candidates = rules
    .filter((rule) => rule.taxClass === taxClass)
    .filter((rule) => rule.paymentMethod === method || rule.paymentMethod === null)
    .filter((rule) => isInForce(rule, serviceStartedAt));

  if (candidates.length === 0) {
    throw new NoApplicableRateError(taxClass, method, serviceStartedAt);
  }

  candidates.sort((a, b) => {
    const specificity = Number(b.paymentMethod !== null) - Number(a.paymentMethod !== null);
    if (specificity !== 0) return specificity;
    return b.effectiveFrom.getTime() - a.effectiveFrom.getTime();
  });

  const winner = candidates[0] as TaxRule;
  return {
    taxClass,
    paymentMethod: method,
    rateBps: winner.rateBps,
    effectiveFrom: winner.effectiveFrom,
    legalReference: winner.legalReference,
  };
}
