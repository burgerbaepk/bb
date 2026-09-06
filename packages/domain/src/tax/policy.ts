import type { Paisa } from '../money/paisa';

/**
 * Tax policy — BUILD-PLAN.md §6.8.
 *
 * Lives in `settings` under `tax.policy`, behind permission
 * `settings.tax.write` at audit level HIGH. It is typed here because the
 * engine takes it as an argument: the same code has to run on the server and
 * in the POS service worker (§8), so it cannot read settings itself.
 */

export type PaymentMethod = 'CASH' | 'CARD' | 'WALLET' | 'QR';
export type OrderType = 'DINE_IN' | 'TAKE_AWAY' | 'DELIVERY';
export type TaxClassKey = 'STANDARD_FOOD' | 'EXEMPT' | 'ZERO';

export type SplitPaymentTaxPolicy = 'PROPORTIONAL' | 'HIGHEST_RATE' | 'PRIMARY_METHOD';
export type RoundingMode = 'NONE' | 'NEAREST_RUPEE' | 'NEAREST_5_RUPEE';
export type RoundingDirection = 'HALF_UP' | 'UP' | 'DOWN';

export interface TaxPolicy {
  /** Master switch: when false no sales tax is calculated or rendered. */
  readonly taxEnabled: boolean;
  readonly serviceChargeBps: number;
  /**
   * False pending P4 — a written opinion from the restaurant's tax advisor
   * under PSTSA s.7(1), whose Explanation covers "charges by whatever name
   * called" and ancillary facilities. If it comes back the other way, every
   * invoice issued in the meantime understated the tax.
   */
  readonly serviceChargeTaxable: boolean;
  readonly serviceChargeAppliesTo: readonly OrderType[];
  readonly posFeePaisa: Paisa;
  /** Also pending P4. */
  readonly posFeeTaxable: boolean;
  readonly splitPaymentTaxPolicy: SplitPaymentTaxPolicy;
  readonly discountBeforeTax: boolean;
  readonly rounding: RoundingMode;
  readonly roundingDirection: RoundingDirection;
}

/** §6.8 defaults, reproduced exactly. */
export const DEFAULT_TAX_POLICY: TaxPolicy = {
  taxEnabled: true,
  serviceChargeBps: 500,
  serviceChargeTaxable: false,
  serviceChargeAppliesTo: ['DINE_IN'],
  posFeePaisa: 100n as Paisa,
  posFeeTaxable: false,
  splitPaymentTaxPolicy: 'PROPORTIONAL',
  discountBeforeTax: true,
  rounding: 'NONE',
  roundingDirection: 'HALF_UP',
};

export const ALL_PAYMENT_METHODS: readonly PaymentMethod[] = ['CARD', 'CASH', 'WALLET', 'QR'];
