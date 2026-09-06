import { parsePaisa, type Paisa } from '../../src/money/paisa';
import { whole, type Qty } from '../../src/money/quantity';
import type { OrderLine } from '../../src/pricing/lines';
import type { TaxRule } from '../../src/tax/rates';
import type { TaxClassKey } from '../../src/tax/policy';

/**
 * Golden fixtures — BUILD-PLAN.md §6.14, Appendix A.
 *
 * Appendix A opens with a warning worth repeating here: **any change to
 * `packages/domain` that alters this output is a breaking change.** These are
 * not regression tests in the usual sense. They are the arithmetic a customer
 * paid and that was filed with two tax authorities.
 */

/** §5.10 — the seeded rules, as the engine receives them. */
export const RULES: readonly TaxRule[] = [
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
    legalReference: 'PSTSA 2012, zero rated',
  },
];

/**
 * §6.7 — the same rules plus the history that preceded them.
 *
 * Before the Punjab Finance Act 2026 there was one standard rate that applied
 * regardless of how the customer paid. The split into 16% cash and 8% card is
 * what the 2026 Act introduced, and it is why this product needs a two-document
 * invoice lifecycle at all.
 *
 * Used by the mid-service rate-change fixtures: an order opened at 23:50 on
 * 30 June and settled at 00:10 on 1 July is taxed at the old rate, because
 * PSTSA s.13 charges the rate in force when the service was provided.
 */
export const RULES_WITH_HISTORY: readonly TaxRule[] = [
  ...RULES,
  {
    taxClass: 'STANDARD_FOOD',
    paymentMethod: null,
    rateBps: 1600,
    effectiveFrom: new Date('2012-07-01T00:00:00Z'),
    effectiveTo: new Date('2026-07-01T00:00:00Z'),
    legalReference: 'PSTSA 2012, standard rate before the 2026 Act',
  },
];

/** Appendix A.1 — 22 August 2026, 14:13, Table 17, dine-in, card. */
export const SERVICE_STARTED_AT = new Date('2026-08-22T09:13:07Z');

function line(
  id: string,
  name: string,
  unit: string,
  quantity: number,
  taxClass: TaxClassKey = 'STANDARD_FOOD',
): OrderLine {
  return {
    id,
    name,
    taxClass,
    unitPrice: parsePaisa(unit),
    qty: whole(quantity),
  };
}

/**
 * Appendix A.1, reproduced exactly.
 *
 *   Mutton Tikka - 4 Pcs            4 ×   530.00 =  2,120.00
 *   Mutton Gola Kabab - 5 Pcs       3 ×   660.00 =  1,980.00
 *   Special Mutton Champ            3 × 1,390.00 =  4,170.00
 *   Special Mutton Mix Olive Half   1 × 3,020.00 =  3,020.00
 *   Roti Per Head                   3 ×    80.00 =    240.00
 *   Half Bowl                       1 ×   260.00 =    260.00
 *   Fresh Salad                     1 ×   270.00 =    270.00
 *   Mineral Water 1.5 Litre         1 ×   160.00 =    160.00
 *   ──────────────────────────────────────────────────────────
 *   Total (ex tax)                                 12,220.00
 */
export const APPENDIX_A1_LINES: readonly OrderLine[] = [
  line('l1', 'Mutton Tikka - 4 Pcs', '530.00', 4),
  line('l2', 'Mutton Gola Kabab - 5 Pcs', '660.00', 3),
  line('l3', 'Special Mutton Champ', '1390.00', 3),
  line('l4', 'Special Mutton Mix Olive Half', '3020.00', 1),
  line('l5', 'Roti Per Head', '80.00', 3),
  line('l6', 'Half Bowl', '260.00', 1),
  line('l7', 'Fresh Salad', '270.00', 1),
  line('l8', 'Mineral Water 1.5 Litre', '160.00', 1),
];

/** The figures Appendix A states, in paisa. Nothing here is computed. */
export const APPENDIX_A1 = {
  subtotal: parsePaisa('12220.00'),
  taxCard: parsePaisa('977.60'),
  taxCash: parsePaisa('1955.20'),
  posFee: parsePaisa('1.00'),
  serviceCharge: parsePaisa('611.00'),
  totalCard: parsePaisa('13809.60'),
  totalCash: parsePaisa('14787.20'),
} as const;

export { line as fixtureLine };
export type { OrderLine, Paisa, Qty };
