import { add, paisa, subtract, sum, type Paisa } from '@natech/domain';

/**
 * Customer credit accounts — ADR 0036, docs/runfiles/M30-customer-accounts.md.
 *
 * Pure, for the same reason as `lib/advances/balance.ts`: the finalize
 * transaction and the payment action ask these once, under lock, with what
 * they read, and the rules are the part worth testing without a database.
 */

export interface AccountAmounts {
  readonly charged: Paisa;
  readonly paid: Paisa;
  /** What the customer owes. Derived, never stored. */
  readonly balance: Paisa;
}

/**
 * Opening + Σ charges − Σ payments. The caller passes only charges whose
 * invoice is still FINALIZED: a credit note turns an invoice CREDITED, and
 * its charge drops out here with no write to this ledger (ADR 0036).
 */
export function accountBalance(
  opening: Paisa,
  charges: readonly Paisa[],
  payments: readonly Paisa[],
): AccountAmounts {
  const charged = sum(charges);
  const paid = sum(payments);
  return { charged, paid, balance: subtract(add(opening, charged), paid) };
}

export interface CreditSaleRequest {
  readonly grandTotal: Paisa;
  /** Cash taken at the counter now; the rest goes on the account. */
  readonly paidNow: Paisa;
  readonly balance: Paisa;
  /** Null is no limit. */
  readonly creditLimit: Paisa | null;
  readonly accountActive: boolean;
}

/** Null when the sale may go on the account; otherwise the sentence to show the cashier. */
export function refuseCreditSale(sale: CreditSaleRequest): string | null {
  if (!sale.accountActive) return 'This account is closed. Ask the owner.';
  if (sale.paidNow < 0n) return 'The amount paid now cannot be negative.';
  // A "credit sale" with nothing on credit is a cash sale; finalize it as one,
  // so it does not appear on the customer's statement as a zero charge.
  if (sale.paidNow >= sale.grandTotal)
    return 'Nothing is left to put on the account. Finalize it as a cash sale.';
  const onAccount = subtract(sale.grandTotal, sale.paidNow);
  if (sale.creditLimit !== null && add(sale.balance, onAccount) > sale.creditLimit)
    return 'This sale would take the account over its credit limit. Take more now, or ask the owner to raise the limit.';
  return null;
}

/**
 * What a finalized invoice left on account: the total less the approved
 * payments taken at the counter. Zero on every ordinary sale, where finalize
 * refuses anything but payment in full. Derived from the invoice the receipt
 * already holds, so the frozen `Invoice` contract (ADR 0008) needs no field.
 */
export function amountOnAccount(invoice: {
  readonly grandTotal: Paisa;
  readonly payments: readonly { readonly amount: Paisa; readonly attemptStatus: string }[];
}): Paisa {
  const paidNow = sum(
    invoice.payments.filter((p) => p.attemptStatus === 'APPROVED').map((p) => p.amount),
  );
  return paidNow >= invoice.grandTotal ? paisa(0n) : subtract(invoice.grandTotal, paidNow);
}
