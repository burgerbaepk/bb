import 'server-only';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  customerAccountEntries,
  customerAccounts,
  customers,
  dbRead,
  invoices,
  orders,
} from '@natech/db';
import { formatPhone, paisa, type Paisa } from '@natech/domain';
import { runningStatement, type SettlementMethod, type StatementRow } from '../purchasing/rules';
import { accountBalance, type AccountAmounts } from './rules';

/**
 * Customer credit accounts — ADR 0036. Reads only, through `dbRead` (R2).
 *
 * Every balance goes through `accountBalance`, the function the finalize and
 * payment actions check against under lock.
 */

export interface AccountRow extends AccountAmounts {
  readonly id: string;
  readonly customerId: string;
  readonly name: string;
  readonly phone: string | null;
  readonly creditLimit: Paisa | null;
  readonly openingBalance: Paisa;
  readonly note: string | null;
  readonly isActive: boolean;
  readonly lastPaymentOn: string | null;
}

/**
 * Charges on invoices still FINALIZED, and payments, per account. A charge on
 * a CREDITED invoice is left out here, which is the whole of how a credit
 * note reaches the account (ADR 0036).
 */
async function entrySums() {
  const rows = await dbRead()
    .select({
      accountId: customerAccountEntries.accountId,
      kind: customerAccountEntries.kind,
      total: sql<string>`sum(${customerAccountEntries.amount})`,
      lastOn: sql<string | null>`max(${customerAccountEntries.occurredOn})::text`,
    })
    .from(customerAccountEntries)
    .leftJoin(invoices, eq(invoices.id, customerAccountEntries.invoiceId))
    .where(
      and(
        isNull(customerAccountEntries.deletedAt),
        sql`(${customerAccountEntries.kind} = 'PAYMENT' or ${invoices.status} = 'FINALIZED')`,
      ),
    )
    .groupBy(customerAccountEntries.accountId, customerAccountEntries.kind);
  const charged = new Map<string, Paisa>();
  const paid = new Map<string, Paisa>();
  const lastPayment = new Map<string, string>();
  for (const row of rows) {
    const value = paisa(BigInt(row.total));
    if (row.kind === 'CHARGE') charged.set(row.accountId, value);
    else {
      paid.set(row.accountId, value);
      if (row.lastOn !== null) lastPayment.set(row.accountId, row.lastOn);
    }
  }
  return { charged, paid, lastPayment };
}

const accountColumns = {
  id: customerAccounts.id,
  customerId: customerAccounts.customerId,
  name: customers.name,
  phone: customers.phone,
  creditLimit: customerAccounts.creditLimit,
  openingBalance: customerAccounts.openingBalance,
  note: customerAccounts.note,
  isActive: customerAccounts.isActive,
};

export async function readAccounts(): Promise<AccountRow[]> {
  const [rows, sums] = await Promise.all([
    dbRead()
      .select(accountColumns)
      .from(customerAccounts)
      .innerJoin(customers, eq(customers.id, customerAccounts.customerId))
      .where(isNull(customerAccounts.deletedAt))
      .orderBy(desc(customerAccounts.isActive), asc(customers.name)),
    entrySums(),
  ]);
  return rows.map((row) => {
    const opening = paisa(row.openingBalance);
    const charged = sums.charged.get(row.id);
    const paid = sums.paid.get(row.id);
    return {
      ...row,
      name: row.name ?? 'Unnamed customer',
      phone: row.phone === null ? null : formatPhone(row.phone),
      creditLimit: row.creditLimit === null ? null : paisa(row.creditLimit),
      openingBalance: opening,
      lastPaymentOn: sums.lastPayment.get(row.id) ?? null,
      ...accountBalance(
        opening,
        charged === undefined ? [] : [charged],
        paid === undefined ? [] : [paid],
      ),
    };
  });
}

const METHOD_SHORT: Record<SettlementMethod, string> = {
  CASH: 'cash',
  BANK_TRANSFER: 'bank transfer',
  CHEQUE: 'cheque',
  WALLET: 'wallet',
};

export interface AccountDetail {
  readonly account: AccountRow;
  readonly statement: readonly StatementRow[];
}

export async function readAccount(id: string): Promise<AccountDetail | null> {
  const account = (await readAccounts()).find((row) => row.id === id);
  if (account === undefined) return null;
  const entries = await dbRead()
    .select({
      id: customerAccountEntries.id,
      kind: customerAccountEntries.kind,
      amount: customerAccountEntries.amount,
      occurredOn: customerAccountEntries.occurredOn,
      method: customerAccountEntries.method,
      reference: customerAccountEntries.reference,
      note: customerAccountEntries.note,
      cashMovementId: customerAccountEntries.cashMovementId,
      invoiceId: customerAccountEntries.invoiceId,
      invoiceStatus: invoices.status,
      localNo: invoices.localNo,
      grandTotal: invoices.grandTotal,
      orderNo: orders.orderNo,
    })
    .from(customerAccountEntries)
    .leftJoin(invoices, eq(invoices.id, customerAccountEntries.invoiceId))
    .leftJoin(orders, eq(orders.id, invoices.orderId))
    .where(and(eq(customerAccountEntries.accountId, id), isNull(customerAccountEntries.deletedAt)));

  const statement = runningStatement(
    account.openingBalance,
    entries
      // As the balance does: a credited invoice is no longer owed.
      .filter((entry) => entry.kind === 'PAYMENT' || entry.invoiceStatus === 'FINALIZED')
      .map((entry) =>
        entry.kind === 'CHARGE'
          ? {
              id: entry.id,
              date: entry.occurredOn,
              kind: 'SALE' as const,
              reference: `Invoice ${entry.localNo ?? ''}`,
              detail: `Order #${entry.orderNo ?? ''}${
                entry.grandTotal !== null && entry.grandTotal !== entry.amount
                  ? ' · part paid at the counter'
                  : ''
              }`,
              debit: paisa(entry.amount),
              credit: null,
              href: entry.invoiceId === null ? null : `/admin/invoices/${entry.invoiceId}`,
            }
          : {
              id: entry.id,
              date: entry.occurredOn,
              kind: 'PAYMENT' as const,
              reference: `Payment · ${entry.method === null ? '' : METHOD_SHORT[entry.method]}${
                entry.cashMovementId === null ? '' : ' (till)'
              }`,
              detail:
                [entry.reference, entry.note].filter((part) => part !== null).join(' · ') || null,
              debit: null,
              credit: paisa(entry.amount),
              href: null,
            },
      ),
  );
  return { account, statement };
}

/** Credit sold on the business dates in range — the receivables side of a sales day. */
export async function readCreditSales(from: string, to: string): Promise<Paisa> {
  const [row] = await dbRead()
    .select({ total: sql<string>`coalesce(sum(${customerAccountEntries.amount}), 0)` })
    .from(customerAccountEntries)
    .innerJoin(invoices, eq(invoices.id, customerAccountEntries.invoiceId))
    .where(
      and(
        eq(customerAccountEntries.kind, 'CHARGE'),
        eq(invoices.status, 'FINALIZED'),
        isNull(customerAccountEntries.deletedAt),
        sql`${customerAccountEntries.occurredOn} between ${from} and ${to}`,
      ),
    );
  return paisa(BigInt(row?.total ?? '0'));
}
