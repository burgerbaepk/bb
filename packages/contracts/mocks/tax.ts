import { DEFAULT_TAX_POLICY, type TaxRule } from '@natech/domain';
import type { TaxPolicySetting, TaxRuleRow } from '../src/settings';
import { uuidFrom } from './ids';

/**
 * Tax rules and policy — BUILD-PLAN.md §5.10, §6.8.
 *
 * These are the seeded rules, restated as the engine's `TaxRule` shape so that
 * every screen in Phase 1 prices through `@natech/domain` rather than against a
 * number somebody typed. The 8% card rate against the 16% cash rate is the
 * whole reason the tax due is unknown until the customer pays, and a mock
 * that hard-coded a total would hide the one thing this milestone exists to
 * review.
 */
export const MOCK_TAX_RULES: readonly TaxRule[] = [
  {
    taxClass: 'STANDARD_FOOD',
    paymentMethod: 'CASH',
    rateBps: 1600,
    effectiveFrom: new Date('2012-07-01T00:00:00Z'),
    legalReference: 'PSTSA 2012, standard rate',
  },
  {
    taxClass: 'STANDARD_FOOD',
    paymentMethod: 'CARD',
    rateBps: 800,
    effectiveFrom: new Date('2026-07-01T00:00:00Z'),
    legalReference: 'Punjab Finance Act 2026',
  },
  {
    taxClass: 'STANDARD_FOOD',
    paymentMethod: 'WALLET',
    rateBps: 800,
    effectiveFrom: new Date('2026-07-01T00:00:00Z'),
    legalReference: 'Punjab Finance Act 2026',
  },
  {
    taxClass: 'STANDARD_FOOD',
    paymentMethod: 'QR',
    rateBps: 800,
    effectiveFrom: new Date('2026-07-01T00:00:00Z'),
    legalReference: 'Punjab Finance Act 2026',
  },
  {
    taxClass: 'EXEMPT',
    paymentMethod: null,
    rateBps: 0,
    effectiveFrom: new Date('2012-07-01T00:00:00Z'),
    legalReference: 'PSTSA 2012, exempt service',
  },
  {
    taxClass: 'ZERO',
    paymentMethod: null,
    rateBps: 0,
    effectiveFrom: new Date('2012-07-01T00:00:00Z'),
    legalReference: 'PSTSA 2012, zero-rated',
  },
];

export const MOCK_TAX_POLICY = DEFAULT_TAX_POLICY;

/** The same rules as admin rows, with the statutory basis each rests on. */
export const MOCK_TAX_RULE_ROWS: readonly TaxRuleRow[] = MOCK_TAX_RULES.map((rule) => ({
  id: uuidFrom(`taxrule:${rule.taxClass}:${rule.paymentMethod ?? 'ANY'}`),
  taxClass: rule.taxClass,
  paymentMethod: rule.paymentMethod,
  rateBps: rule.rateBps,
  effectiveFrom: rule.effectiveFrom,
  effectiveTo: null,
  legalReference: rule.legalReference ?? 'PSTSA 2012',
}));

export const MOCK_TAX_POLICY_SETTING: TaxPolicySetting = {
  serviceChargeEnabled: true,
  serviceChargeBps: MOCK_TAX_POLICY.serviceChargeBps,
  serviceChargeTaxable: MOCK_TAX_POLICY.serviceChargeTaxable,
  serviceChargeAppliesTo: [...MOCK_TAX_POLICY.serviceChargeAppliesTo],
  posFeePaisa: MOCK_TAX_POLICY.posFeePaisa.toString(),
  posFeeTaxable: MOCK_TAX_POLICY.posFeeTaxable,
  splitPaymentTaxPolicy: MOCK_TAX_POLICY.splitPaymentTaxPolicy,
  discountBeforeTax: MOCK_TAX_POLICY.discountBeforeTax,
  rounding: MOCK_TAX_POLICY.rounding,
  roundingDirection: MOCK_TAX_POLICY.roundingDirection,
};
