import 'server-only';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { customerAccountEntries, invoices, type Tx } from '@natech/db';
import { paisa, type Paisa } from '@natech/domain';
import { accountBalance, type AccountAmounts } from './rules';

/**
 * An account's balance read through the caller's transaction — ADR 0036.
 *
 * Not in a `'use server'` module: every export of one is a callable endpoint.
 * The finalize transaction and the payment action each lock the account row
 * `FOR UPDATE` before calling this, so two credit sales rung up at once cannot
 * both read the old balance and together pass the credit limit.
 */
export async function readAccountBalances(
  tx: Tx,
  accounts: readonly { readonly id: string; readonly openingBalance: bigint }[],
): Promise<Map<string, AccountAmounts>> {
  if (accounts.length === 0) return new Map();
  const rows = await tx
    .select({
      accountId: customerAccountEntries.accountId,
      kind: customerAccountEntries.kind,
      total: sql<string>`sum(${customerAccountEntries.amount})`,
    })
    .from(customerAccountEntries)
    .leftJoin(invoices, eq(invoices.id, customerAccountEntries.invoiceId))
    .where(
      and(
        inArray(
          customerAccountEntries.accountId,
          accounts.map((account) => account.id),
        ),
        isNull(customerAccountEntries.deletedAt),
        // A charge on a CREDITED invoice is no longer owed.
        sql`(${customerAccountEntries.kind} = 'PAYMENT' or ${invoices.status} = 'FINALIZED')`,
      ),
    )
    .groupBy(customerAccountEntries.accountId, customerAccountEntries.kind);
  const pick = (id: string, kind: 'CHARGE' | 'PAYMENT'): Paisa[] => {
    const row = rows.find((r) => r.accountId === id && r.kind === kind);
    return row === undefined ? [] : [paisa(BigInt(row.total))];
  };
  return new Map(
    accounts.map((account) => [
      account.id,
      accountBalance(
        paisa(account.openingBalance),
        pick(account.id, 'CHARGE'),
        pick(account.id, 'PAYMENT'),
      ),
    ]),
  );
}
