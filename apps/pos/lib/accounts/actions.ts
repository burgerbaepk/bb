'use server';

import { revalidatePath } from 'next/cache';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  cashMovements,
  customerAccountEntries,
  customerAccounts,
  customers,
  dbWrite,
  shifts,
  withIdempotency,
  writeAudit,
  type AuditContext,
} from '@natech/db';
import { canonicalPhone, formatPhone, paisa, parsePaisa, type Paisa } from '@natech/domain';
import { toPaisaWire } from '@natech/contracts';
import {
  Forbidden,
  Locked,
  NotSignedIn,
  assertPermission,
  requestContext,
  requireOperator,
  requireTillStaff,
} from '../auth/session';
import { currentBusinessDate } from '../orders/businessDate';
import { parseOptionalRupees, refuseSettlement } from '../purchasing/rules';
import { readAccountBalances } from './ledger';

/**
 * Customer credit accounts — ADR 0036, docs/runfiles/M30-customer-accounts.md.
 *
 * Opening an account, changing its limit and closing it are `staff.write`,
 * owner-only: giving somebody credit is the owner's decision, and a cashier
 * who could open an account could invent a customer and sell to them on it.
 * Recording money received is `payment.take`, the grant for taking money.
 * The credit sale itself is in `finalizeOrderAction`.
 *
 * Every write is one `dbWrite` transaction with its audit rows (R2, R7).
 */

export interface AccountActionState {
  readonly error: string | null;
  readonly message: string | null;
}

class Refusal extends Error {}

const optional = (value: FormDataEntryValue | null): string | null => {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
};

async function auditContext(actorId: string): Promise<AuditContext> {
  const context = await requestContext();
  return { actorId, ip: context.ip ?? undefined, ua: context.ua ?? undefined };
}

/** Blank is no limit; anything else is rupees ≥ 0. */
function parseLimit(text: string): Paisa | null | string {
  return text.trim() === '' ? null : parseOptionalRupees(text, 'Credit limit');
}

const AccountInput = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(2, 'Enter the customer’s name.').max(120),
  phone: z.string().trim().min(1, 'Enter a mobile number.'),
  creditLimit: z.string(),
  openingBalance: z.string(),
  note: z.string().trim().max(240).nullable(),
});

/**
 * Open an account, or change one. The person is a `customers` row, found by
 * their canonical mobile number (ADR 0016's key) or created, so the same
 * customer the till already knows by phone is the one with the account.
 */
export async function saveAccountAction(
  _previous: AccountActionState,
  form: FormData,
): Promise<AccountActionState> {
  const operator = await requireOperator();
  assertPermission(operator, 'staff.write');
  const parsed = AccountInput.safeParse({
    id: optional(form.get('id')),
    name: form.get('name'),
    phone: form.get('phone'),
    creditLimit: String(form.get('creditLimit') ?? ''),
    openingBalance: String(form.get('openingBalance') ?? ''),
    note: optional(form.get('note')),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Check the account.', message: null };
  const input = parsed.data;
  const phone = canonicalPhone(input.phone);
  if (phone === null)
    return { error: 'Enter a Pakistani mobile number, in the form 03XX XXXXXXX.', message: null };
  const creditLimit = parseLimit(input.creditLimit);
  if (typeof creditLimit === 'string') return { error: creditLimit, message: null };
  const opening = parseOptionalRupees(input.openingBalance, 'Opening balance');
  if (typeof opening === 'string') return { error: opening, message: null };

  const audit = await auditContext(operator.id);
  try {
    await dbWrite().transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(and(eq(customers.phone, phone), isNull(customers.deletedAt)));
      let customerId: string;
      if (existing === undefined) {
        const [created] = await tx
          .insert(customers)
          .values({ phone, name: input.name })
          .returning({ id: customers.id });
        if (created === undefined) throw new Error('Adding the customer returned no row.');
        customerId = created.id;
      } else {
        customerId = existing.id;
        if (existing.name !== input.name)
          await tx
            .update(customers)
            .set({ name: input.name, updatedAt: new Date() })
            .where(eq(customers.id, customerId));
      }

      const [held] = await tx
        .select({ id: customerAccounts.id })
        .from(customerAccounts)
        .where(
          and(eq(customerAccounts.customerId, customerId), isNull(customerAccounts.deletedAt)),
        );
      if (held !== undefined && held.id !== input.id)
        throw new Refusal(`${formatPhone(phone)} already has an account.`);

      const fields = {
        creditLimit,
        openingBalance: opening,
        note: input.note,
      };
      const after = {
        customerId,
        name: input.name,
        phone,
        creditLimit: creditLimit?.toString() ?? null,
        openingBalance: opening.toString(),
        note: input.note,
      };
      if (input.id === null) {
        const [created] = await tx
          .insert(customerAccounts)
          .values({ customerId, ...fields })
          .returning({ id: customerAccounts.id });
        if (created === undefined) throw new Error('Opening the account returned no row.');
        await writeAudit(tx, audit, {
          entity: 'customer_accounts',
          entityId: created.id,
          action: 'CUSTOMER_ACCOUNT_OPENED',
          after,
        });
        return;
      }
      const [before] = await tx
        .select()
        .from(customerAccounts)
        .where(and(eq(customerAccounts.id, input.id), isNull(customerAccounts.deletedAt)))
        .for('update');
      if (before === undefined) throw new Refusal('That account no longer exists.');
      await tx
        .update(customerAccounts)
        .set({ customerId, ...fields, updatedAt: new Date() })
        .where(eq(customerAccounts.id, input.id));
      await writeAudit(tx, audit, {
        entity: 'customer_accounts',
        entityId: input.id,
        action: 'CUSTOMER_ACCOUNT_CHANGED',
        before: {
          customerId: before.customerId,
          creditLimit: before.creditLimit?.toString() ?? null,
          openingBalance: before.openingBalance.toString(),
          note: before.note,
        },
        after,
      });
    });
  } catch (error) {
    if (error instanceof Refusal) return { error: error.message, message: null };
    throw error;
  }
  revalidatePath('/admin/customers');
  if (input.id !== null) revalidatePath(`/admin/customers/${input.id}`);
  return {
    error: null,
    message: input.id === null ? `Account opened for ${input.name}.` : `${input.name} saved.`,
  };
}

/** Close or reopen. A closed account takes no new credit sales, but still takes payments. */
export async function setAccountActiveAction(accountId: string, isActive: boolean): Promise<void> {
  const operator = await requireOperator();
  assertPermission(operator, 'staff.write');
  if (!z.uuid().safeParse(accountId).success) return;
  const audit = await auditContext(operator.id);
  await dbWrite().transaction(async (tx) => {
    const updated = await tx
      .update(customerAccounts)
      .set({ isActive, updatedAt: new Date() })
      .where(and(eq(customerAccounts.id, accountId), isNull(customerAccounts.deletedAt)))
      .returning({ id: customerAccounts.id });
    if (updated.length === 0) return;
    await writeAudit(tx, audit, {
      entity: 'customer_accounts',
      entityId: accountId,
      action: isActive ? 'CUSTOMER_ACCOUNT_REOPENED' : 'CUSTOMER_ACCOUNT_CLOSED',
      after: { isActive },
    });
  });
  revalidatePath('/admin/customers');
  revalidatePath(`/admin/customers/${accountId}`);
}

const PaymentInput = z.object({
  formKey: z.uuid('Reload the page and try again.'),
  accountId: z.uuid('Choose an account.'),
  amount: z.string().trim().min(1, 'Enter an amount.'),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CHEQUE', 'WALLET']),
  reference: z.string().trim().max(60).nullable(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.'),
  throughTill: z.boolean(),
  note: z.string().trim().max(240).nullable(),
});

/**
 * Money received from an account customer. Cash into the drawer writes a
 * `PAY_IN` on the open shift in the same transaction, linked from the entry,
 * so the drawer reconciles (ADR 0033's pattern). It is not a sale and not a
 * payment on an invoice: the invoice was finalized, and taxed, when the food
 * was served (R9). This settles the debt the invoice left.
 */
export async function recordAccountPaymentAction(
  _previous: AccountActionState,
  form: FormData,
): Promise<AccountActionState> {
  const operator = await requireOperator();
  assertPermission(operator, 'payment.take');
  const parsed = PaymentInput.safeParse({
    formKey: form.get('formKey'),
    accountId: form.get('accountId'),
    amount: form.get('amount'),
    method: form.get('method'),
    reference: optional(form.get('reference')),
    occurredOn: form.get('occurredOn'),
    throughTill: form.get('throughTill') === 'on',
    note: optional(form.get('note')),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Check the payment.', message: null };
  const input = parsed.data;
  let amount: Paisa;
  try {
    amount = parsePaisa(input.amount.replace(/,/g, ''));
  } catch {
    return { error: 'Enter an amount in rupees, e.g. 5000 or 2500.50.', message: null };
  }

  const audit = await auditContext(operator.id);
  try {
    const name = await dbWrite().transaction(async (tx) => {
      const outcome = await withIdempotency(tx, input.formKey, 'customer_payment', async () => {
        // Serialises every entry on this account, so the balance check holds.
        const [account] = await tx
          .select({
            id: customerAccounts.id,
            openingBalance: customerAccounts.openingBalance,
            name: customers.name,
          })
          .from(customerAccounts)
          .innerJoin(customers, eq(customers.id, customerAccounts.customerId))
          .where(and(eq(customerAccounts.id, input.accountId), isNull(customerAccounts.deletedAt)))
          .for('update', { of: customerAccounts });
        if (account === undefined) throw new Refusal('That account no longer exists.');
        const balance =
          (await readAccountBalances(tx, [account])).get(account.id)?.balance ?? paisa(0n);
        const refusal = refuseSettlement({
          amount,
          method: input.method,
          throughTill: input.throughTill,
          occurredOn: input.occurredOn,
          today: await currentBusinessDate(tx),
          balance,
        });
        if (refusal !== null) throw new Refusal(refusal);
        const label = account.name ?? 'account customer';

        let cashMovementId: string | null = null;
        if (input.throughTill) {
          const [shift] = await tx
            .select({ id: shifts.id })
            .from(shifts)
            .where(eq(shifts.status, 'OPEN'))
            .for('update');
          if (shift === undefined)
            throw new Refusal('No shift is open, so the till cannot have taken this.');
          const reason = `Account payment — ${label}`;
          const [movement] = await tx
            .insert(cashMovements)
            .values({ shiftId: shift.id, type: 'PAY_IN', amount, reason, actorId: operator.id })
            .returning({ id: cashMovements.id });
          if (movement === undefined)
            throw new Error('Recording the till movement returned no row.');
          await writeAudit(tx, audit, {
            entity: 'cash_movements',
            entityId: movement.id,
            action: 'PAY_IN',
            after: { shiftId: shift.id, amount: amount.toString(), reason },
          });
          cashMovementId = movement.id;
        }

        const [created] = await tx
          .insert(customerAccountEntries)
          .values({
            accountId: account.id,
            kind: 'PAYMENT',
            amount,
            method: input.method,
            reference: input.reference,
            occurredOn: input.occurredOn,
            cashMovementId,
            note: input.note,
            recordedBy: operator.id,
          })
          .returning({ id: customerAccountEntries.id });
        if (created === undefined) throw new Error('Recording the payment returned no row.');
        await writeAudit(tx, audit, {
          entity: 'customer_account_entries',
          entityId: created.id,
          action: 'CUSTOMER_ACCOUNT_PAID',
          after: {
            accountId: account.id,
            amount: amount.toString(),
            method: input.method,
            occurredOn: input.occurredOn,
            cashMovementId,
          },
        });
        return { name: label };
      });
      return outcome.result.name;
    });
    revalidatePath('/admin/customers');
    revalidatePath(`/admin/customers/${input.accountId}`);
    if (input.throughTill) {
      revalidatePath('/shift');
      revalidatePath('/admin/shift');
    }
    return {
      error: null,
      message: `Payment from ${name} recorded${input.throughTill ? ' and added to the till' : ''}.`,
    };
  } catch (error) {
    if (error instanceof Refusal) return { error: error.message, message: null };
    throw error;
  }
}

/** What the till's credit-sale dialog lists. Money crosses the wire as decimal strings (R1). */
export interface TillAccount {
  readonly id: string;
  readonly name: string;
  readonly phone: string | null;
  readonly balance: string;
  readonly creditLimit: string | null;
}

/**
 * Open accounts with their balances, for the till — ADR 0036. Read when the
 * dialog opens rather than with the page, so the balance is the one now. The
 * finalize re-reads it under lock; this is for the cashier's eyes.
 */
export async function listTillAccountsAction(): Promise<{
  readonly error: string | null;
  readonly accounts: readonly TillAccount[];
}> {
  try {
    const { viewer } = await requireTillStaff();
    assertPermission(viewer, 'payment.take');
  } catch (error) {
    if (error instanceof Locked || error instanceof NotSignedIn || error instanceof Forbidden)
      return { error: error.message, accounts: [] };
    throw error;
  }
  // R2 — the actions directory reads through `dbWrite` too; a read-only
  // transaction is how `readAccountBalances` takes its `Tx`.
  const accounts = await dbWrite().transaction(async (tx) => {
    const rows = await tx
      .select({
        id: customerAccounts.id,
        openingBalance: customerAccounts.openingBalance,
        creditLimit: customerAccounts.creditLimit,
        name: customers.name,
        phone: customers.phone,
      })
      .from(customerAccounts)
      .innerJoin(customers, eq(customers.id, customerAccounts.customerId))
      .where(and(eq(customerAccounts.isActive, true), isNull(customerAccounts.deletedAt)))
      .orderBy(asc(customers.name));
    const balances = await readAccountBalances(tx, rows);
    return rows.map((row) => ({
      id: row.id,
      name: row.name ?? 'Unnamed customer',
      phone: row.phone === null ? null : formatPhone(row.phone),
      balance: toPaisaWire(balances.get(row.id)?.balance ?? paisa(0n)),
      creditLimit: row.creditLimit === null ? null : toPaisaWire(paisa(row.creditLimit)),
    }));
  });
  return { error: null, accounts };
}
