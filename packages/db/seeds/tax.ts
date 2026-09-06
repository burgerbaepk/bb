/**
 * Tax classes and rules — BUILD-PLAN.md §5.10, §6.7.
 *
 * Rates are integer basis points. Never a float percentage: 8% stored as 0.08
 * is not 0.08, and the error compounds across a day of trade.
 *
 * The two standard-food rows are the whole reason the tax due is unknown
 * until the customer chooses how to pay: cash is taxed at 16%, card and
 * digital at 8%. That is why the tax invoice is computed only after payment,
 * at finalize (§6).
 *
 * §6.7 resolves these against `orders.service_started_at`, not the finalize
 * time, because PSTSA s.13 charges the rate in force when the service was
 * provided. An order opened at 23:50 on 30 June and settled at 00:10 on 1 July
 * is taxed at the old rate.
 */
export interface TaxClassSeed {
  readonly key: string;
  readonly name: string;
  readonly description: string;
}

export const TAX_CLASSES: readonly TaxClassSeed[] = [
  {
    key: 'STANDARD_FOOD',
    name: 'Standard food and beverage',
    description: 'Prepared food served on the premises. Rate depends on payment method.',
  },
  {
    key: 'EXEMPT',
    name: 'Exempt',
    description: 'Not chargeable to Punjab sales tax on services.',
  },
  {
    key: 'ZERO',
    name: 'Zero rated',
    description: 'Chargeable at zero percent.',
  },
];

export interface TaxRuleSeed {
  readonly taxClassKey: string;
  readonly paymentMethod: 'CASH' | 'CARD' | 'WALLET' | 'QR' | null;
  readonly rateBps: number;
  readonly effectiveFrom: string;
  readonly legalReference: string;
}

/** §5.10 — the seed table, reproduced exactly. */
export const TAX_RULES: readonly TaxRuleSeed[] = [
  {
    taxClassKey: 'STANDARD_FOOD',
    paymentMethod: 'CASH',
    rateBps: 1600,
    effectiveFrom: '2012-07-01T00:00:00Z',
    legalReference: 'PSTSA 2012, standard rate',
  },
  {
    taxClassKey: 'STANDARD_FOOD',
    paymentMethod: 'CARD',
    rateBps: 800,
    effectiveFrom: '2026-07-01T00:00:00Z',
    legalReference: 'Punjab Finance Act 2026',
  },
  {
    taxClassKey: 'STANDARD_FOOD',
    paymentMethod: 'WALLET',
    rateBps: 800,
    effectiveFrom: '2026-07-01T00:00:00Z',
    legalReference: 'Punjab Finance Act 2026',
  },
  {
    taxClassKey: 'STANDARD_FOOD',
    paymentMethod: 'QR',
    rateBps: 800,
    effectiveFrom: '2026-07-01T00:00:00Z',
    legalReference: 'Punjab Finance Act 2026',
  },
  {
    taxClassKey: 'EXEMPT',
    paymentMethod: null,
    rateBps: 0,
    effectiveFrom: '2012-07-01T00:00:00Z',
    legalReference: 'PSTSA 2012, exempt service',
  },
  {
    taxClassKey: 'ZERO',
    paymentMethod: null,
    rateBps: 0,
    effectiveFrom: '2012-07-01T00:00:00Z',
    legalReference: 'PSTSA 2012, zero rated',
  },
];

/**
 * §6.8 — the policy object, seeded into `settings` under `tax.policy`.
 * Editable in admin behind `settings.tax.write` at audit level HIGH.
 *
 * `serviceChargeTaxable` and `posFeeTaxable` are false pending P4, which is a
 * written opinion from the restaurant's tax advisor under PSTSA s.7(1). If that
 * comes back the other way, the engine changes and every invoice issued in the
 * meantime was understated.
 */
export const TAX_POLICY = {
  taxEnabled: true,
  serviceChargeBps: 500,
  serviceChargeTaxable: false,
  serviceChargeAppliesTo: ['DINE_IN'],
  posFeePaisa: '100',
  posFeeEnabled: true,
  posFeeTaxable: false,
  splitPaymentTaxPolicy: 'PROPORTIONAL',
  discountBeforeTax: true,
  rounding: 'NONE',
  roundingDirection: 'HALF_UP',
} as const;
