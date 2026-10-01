import {
  add,
  paisa,
  parsePaisa,
  parseQty,
  subtract,
  sum,
  type Paisa,
  type Qty,
} from '@natech/domain';

/**
 * Purchasing's rules — ADR 0035, docs/runfiles/M29-purchasing.md.
 *
 * Pure, and apart from the `server-only` modules for the same reason as
 * `lib/advances/balance.ts`: the actions ask these functions once, inside
 * their transaction, with what they read under lock, and the branchy part is
 * worth testing without a database.
 */

export type SettlementMethod = 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'WALLET';

export const SETTLEMENT_METHODS: readonly SettlementMethod[] = [
  'CASH',
  'BANK_TRANSFER',
  'CHEQUE',
  'WALLET',
];

export const SETTLEMENT_LABEL: Record<SettlementMethod, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  CHEQUE: 'Cheque',
  WALLET: 'JazzCash / Easypaisa',
};

export const PO_STATUS_LABEL: Record<'OPEN' | 'CLOSED' | 'CANCELLED', string> = {
  OPEN: 'Open',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};

/** One line exactly as the bill or PO form posted it. */
export interface RawLine {
  readonly itemId: string;
  readonly qty: string;
  readonly amount: string;
  readonly unit: string;
}

export interface PurchaseLine {
  readonly itemId: string;
  readonly quantity: Qty;
  /** Null only on a PO line with no agreed price. A bill line always has one. */
  readonly amount: Paisa | null;
  /** A unit typed against an item with none saved; the action decides whether to keep it. */
  readonly unit: string | null;
}

/**
 * Turn the posted line rows into lines, naming each problem by item.
 *
 * A row with no item and nothing typed is the empty row the form always keeps
 * at the bottom, and is skipped. An item chosen twice is refused rather than
 * merged: two lines of chicken on one bill is usually a typo in one of them,
 * and adding them together would hide which.
 */
export function collectLines(
  rows: readonly RawLine[],
  names: ReadonlyMap<string, string>,
  options: { readonly amountRequired: boolean },
): { readonly lines: readonly PurchaseLine[]; readonly errors: readonly string[] } {
  const lines: PurchaseLine[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  rows.forEach((row, index) => {
    const qtyText = row.qty.trim();
    const amountText = row.amount.trim().replace(/,/g, '');
    if (row.itemId === '' && qtyText === '' && amountText === '') return;
    const name = names.get(row.itemId);
    if (name === undefined) {
      errors.push(`Line ${index + 1}: choose an item from the list.`);
      return;
    }
    if (seen.has(row.itemId)) {
      errors.push(`${name}: appears twice. Put it on one line.`);
      return;
    }
    seen.add(row.itemId);

    let quantity: Qty;
    try {
      quantity = parseQty(qtyText);
    } catch {
      errors.push(`${name}: enter a quantity, e.g. 20 or 0.25.`);
      return;
    }
    if (quantity <= 0n) {
      errors.push(`${name}: the quantity must be more than zero.`);
      return;
    }

    let amount: Paisa | null = null;
    if (amountText !== '') {
      try {
        amount = parsePaisa(amountText);
      } catch {
        errors.push(`${name}: enter the amount in rupees, e.g. 13000 or 2450.50.`);
        return;
      }
      if (amount < 0n) {
        errors.push(`${name}: the amount cannot be negative.`);
        return;
      }
    } else if (options.amountRequired) {
      errors.push(`${name}: enter the line amount from the bill.`);
      return;
    }

    const unit = row.unit.trim().slice(0, 32);
    lines.push({ itemId: row.itemId, quantity, amount, unit: unit === '' ? null : unit });
  });

  return { lines, errors };
}

/** Goods + charges − discount. Refused by the caller, not clamped, when negative. */
export function billTotal(lineAmounts: readonly Paisa[], charges: Paisa, discount: Paisa): Paisa {
  return subtract(add(sum(lineAmounts), charges), discount);
}

export interface SupplierAmounts {
  readonly billed: Paisa;
  readonly paid: Paisa;
  /** What the restaurant owes. Negative is an advance with the supplier. */
  readonly balance: Paisa;
}

/**
 * Opening + Σ posted bills − Σ payments. Cancelled bills are left out by the
 * caller's query, so cancelling a bill lowers the balance with no write here.
 */
export function supplierBalance(
  opening: Paisa,
  billTotals: readonly Paisa[],
  payments: readonly Paisa[],
): SupplierAmounts {
  const billed = sum(billTotals);
  const paid = sum(payments);
  return { billed, paid, balance: subtract(add(opening, billed), paid) };
}

export interface SettlementRequest {
  readonly amount: Paisa;
  readonly method: SettlementMethod;
  readonly throughTill: boolean;
  readonly occurredOn: string;
  readonly today: string;
  /** What is owed before this payment. */
  readonly balance: Paisa;
}

/**
 * Null when a payment (to a supplier, or from an account customer) may be
 * written; otherwise the sentence to show. Shared by both ledgers so the two
 * cannot drift into different rules about the till.
 */
export function refuseSettlement(p: SettlementRequest): string | null {
  if (p.amount <= 0n) return 'Enter an amount greater than zero.';
  if (p.occurredOn > p.today) return 'A payment cannot be dated in the future.';
  // ADR 0033's rule, for the same reason: with no edit and no delete, an
  // overpayment typed by mistake could only be undone by inventing a bill.
  if (p.amount > p.balance)
    return `That is more than the balance of Rs. ${formatRupees(p.balance)}. Check the amount.`;
  if (p.throughTill && p.method !== 'CASH') return 'Only cash goes through the till.';
  // The drawer is tonight's. A movement in it dated last week would make the
  // shift and the ledger disagree about when the cash moved.
  if (p.throughTill && p.occurredOn !== p.today)
    return 'Cash through the till must be dated today.';
  return null;
}

/** For a refusal sentence only; the screen formats money through `Money` (R1). */
function formatRupees(value: Paisa): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const rupees = (magnitude / 100n).toLocaleString('en-PK');
  const paise = String(magnitude % 100n).padStart(2, '0');
  return `${negative ? '-' : ''}${rupees}.${paise}`;
}

/** A form's rupee box: blank is zero; anything else must parse and be ≥ 0. */
export function parseOptionalRupees(text: string, label: string): Paisa | string {
  const clean = text.trim().replace(/,/g, '');
  if (clean === '') return paisa(0n);
  try {
    const value = parsePaisa(clean);
    return value < 0n ? `${label} cannot be negative.` : value;
  } catch {
    return `${label}: enter rupees, e.g. 500 or 120.50.`;
  }
}

/* -------------------------------------------------------------- statements */

export type StatementKind = 'OPENING' | 'BILL' | 'SALE' | 'PAYMENT';

export interface StatementRow {
  readonly id: string;
  readonly date: string;
  readonly kind: StatementKind;
  readonly reference: string;
  readonly detail: string | null;
  /** Raises what is owed. */
  readonly debit: Paisa | null;
  /** Lowers it. */
  readonly credit: Paisa | null;
  readonly balance: Paisa;
  readonly href: string | null;
}

/**
 * A running statement, oldest first, as a ledger card reads. Shared by the
 * supplier statement (ADR 0035) and the customer statement (ADR 0036): a
 * debit raises what is owed, a credit lowers it, and the last row's balance
 * is the same figure `supplierBalance`/`accountBalance` derive. On one date,
 * the bill or sale is listed before the payment against it.
 *
 * Cancelled bills and credited invoices are left out by the caller, because
 * the balance leaves them out.
 */
export function runningStatement(
  opening: Paisa,
  entries: readonly Omit<StatementRow, 'balance'>[],
): StatementRow[] {
  const sorted = [...entries].sort((a, b) =>
    a.date === b.date
      ? a.kind === b.kind
        ? 0
        : a.kind === 'PAYMENT'
          ? 1
          : -1
      : a.date < b.date
        ? -1
        : 1,
  );
  let running: bigint = opening;
  const rows: StatementRow[] = [
    {
      id: 'opening',
      date: '',
      kind: 'OPENING',
      reference: 'Opening balance',
      detail: null,
      debit: null,
      credit: null,
      balance: opening,
      href: null,
    },
  ];
  for (const entry of sorted) {
    running = running + (entry.debit ?? 0n) - (entry.credit ?? 0n);
    rows.push({ ...entry, balance: paisa(running) });
  }
  return rows;
}
