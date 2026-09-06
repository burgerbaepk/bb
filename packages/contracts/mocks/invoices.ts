import { ZERO, computeTotals, paisa, type Totals } from '@natech/domain';
import type { Order } from '../src/orders';
import type { CreditNote, Invoice, Payment, PaymentSliceDraft } from '../src/invoices';
import type { PaymentMethod } from '../src/enums';
import { MOCK_TAX_POLICY, MOCK_TAX_RULES } from './tax';
import { toDomainLines } from '../src/orders';
import { orderBySlug } from './orders';
import { MOCK_BUSINESS_DATE, ago, uuidFrom } from './ids';

/**
 * Invoices — BUILD-PLAN.md §5.8, §6.3, §7.5, Appendix A.1, A.3.
 *
 * `MOCK_REFERENCE_INVOICE` is Appendix A.1 computed, not transcribed: subtotal
 * 12,220.00, tax 977.60 at 800 bps on card, POS fee 1.00, service charge 611.00
 * untaxed, grand total 13,809.60, and a single `invoice_tax_lines` row.
 *
 * `MOCK_DECLINED_THEN_CASH_INVOICE` is Appendix A.3: a declined card attempt
 * recorded as a `payments` row, and settlement in cash at 1600 bps for
 * 14,787.20. The decline is the event that moves the rate, which is why §5.8
 * records it rather than leaving it to be inferred from a gap.
 */

export function totalsFor(order: Order, slices: readonly PaymentSliceDraft[]): Totals {
  return computeTotals({
    lines: toDomainLines(order),
    orderType: order.type,
    deliveryCharge: order.deliveryCharge,
    orderDiscount: order.orderDiscount,
    payments: slices
      .filter((slice) => slice.attemptStatus === 'APPROVED')
      .map((slice) => ({ method: slice.method, amount: slice.amount })),
    serviceStartedAt: order.serviceStartedAt,
    rules: MOCK_TAX_RULES,
    policy: MOCK_TAX_POLICY,
  });
}

function payment(
  seed: string,
  method: PaymentMethod,
  amount: bigint,
  attemptStatus: 'APPROVED' | 'DECLINED',
  rateBps: number | null,
  declinedReason: string | null,
  secondsAgo: number,
): Payment {
  return {
    id: uuidFrom(`payment:${seed}`),
    method,
    amount: paisa(amount),
    tendered: method === 'CASH' ? paisa(amount) : null,
    change: method === 'CASH' ? ZERO : null,
    cardLast4: method === 'CARD' ? '4417' : null,
    terminalRef: method === 'CARD' ? 'AUTH-88214' : null,
    taxRateAppliedBps: rateBps,
    attemptStatus,
    declinedReason,
    at: ago(secondsAgo),
  };
}

function toInvoice(
  seed: string,
  order: Order,
  localNo: string,
  totals: Totals,
  payments: readonly Payment[],
): Invoice {
  return {
    id: uuidFrom(`invoice:${seed}`),
    orderId: order.id,
    localNo,
    businessDate: MOCK_BUSINESS_DATE,
    finalizedAt: ago(120),
    finalizedByName: 'Sana Iqbal',
    terminalLabel: 'Till 1',
    status: 'FINALIZED',
    subtotal: totals.subtotal,
    discountTotal: totals.discountTotal,
    taxableBase: totals.taxableBase,
    taxTotal: totals.taxTotal,
    deliveryCharge: totals.deliveryCharge ?? paisa(0n),
    serviceCharge: totals.serviceCharge,
    posFee: totals.posFee,
    roundingAdj: totals.roundingAdj,
    grandTotal: totals.grandTotal,
    taxLines: totals.taxLines.map((taxLine, index) => ({
      id: uuidFrom(`taxline:${seed}:${index}`),
      taxClass: taxLine.taxClass,
      rateBps: taxLine.rateBps,
      base: taxLine.base,
      amount: taxLine.amount,
      paymentMethodScope: taxLine.paymentMethodScope,
    })),
    payments: [...payments],
    printedCount: 1,
  };
}

const REFERENCE_ORDER = orderBySlug('table-17');

/** Appendix A.1 — settled on card at 8%. */
const CARD_SLICES: readonly PaymentSliceDraft[] = [
  {
    method: 'CARD',
    amount: paisa(1380960n),
    attemptStatus: 'APPROVED',
    declinedReason: null,
  },
];

export const MOCK_REFERENCE_TOTALS: Totals = totalsFor(REFERENCE_ORDER, CARD_SLICES);

export const MOCK_REFERENCE_INVOICE: Invoice = toInvoice(
  'reference',
  REFERENCE_ORDER,
  'INV-20260822-11272',
  MOCK_REFERENCE_TOTALS,
  [payment('reference:card', 'CARD', 1380960n, 'APPROVED', 800, null, 120)],
);

/**
 * Appendix A.3 — the card declines, the customer pays cash, and the rate moves
 * from 8% to 16%. The invoice totals 14,787.20 and the declined attempt stays
 * on the record.
 */
const DECLINE_THEN_CASH: readonly PaymentSliceDraft[] = [
  {
    method: 'CARD',
    amount: paisa(1380960n),
    attemptStatus: 'DECLINED',
    declinedReason: 'Issuer declined — insufficient funds',
  },
  {
    method: 'CASH',
    amount: paisa(1478720n),
    attemptStatus: 'APPROVED',
    declinedReason: null,
  },
];

export const MOCK_DECLINED_THEN_CASH_TOTALS: Totals = totalsFor(REFERENCE_ORDER, DECLINE_THEN_CASH);

export const MOCK_DECLINED_THEN_CASH_INVOICE: Invoice = toInvoice(
  'decline-cash',
  REFERENCE_ORDER,
  'INV-20260822-11273',
  MOCK_DECLINED_THEN_CASH_TOTALS,
  [
    payment(
      'decline-cash:card',
      'CARD',
      1380960n,
      'DECLINED',
      null,
      'Issuer declined — insufficient funds',
      200,
    ),
    payment('decline-cash:cash', 'CASH', 1478720n, 'APPROVED', 1600, null, 150),
  ],
);

/** §6.6 — a proportional split across two methods, one row per slice. */
export const MOCK_SPLIT_SLICES: readonly PaymentSliceDraft[] = [
  { method: 'CARD', amount: paisa(600000n), attemptStatus: 'APPROVED', declinedReason: null },
  { method: 'CASH', amount: paisa(400000n), attemptStatus: 'APPROVED', declinedReason: null },
];

export const MOCK_INVOICES: readonly Invoice[] = [
  MOCK_REFERENCE_INVOICE,
  MOCK_DECLINED_THEN_CASH_INVOICE,
];

/** K2 — the refund path is a credit note (`invoiceType: 4`), never a VOID. */
export const MOCK_CREDIT_NOTES: readonly CreditNote[] = [
  {
    id: uuidFrom('creditnote:1'),
    invoiceId: MOCK_REFERENCE_INVOICE.id,
    invoiceLocalNo: MOCK_REFERENCE_INVOICE.localNo,
    reason: 'Item returned — mutton champ sent back to the kitchen',
    amount: paisa(139000n),
    issuedAt: ago(90),
    issuedByName: 'Faisal Rehman',
  },
];
