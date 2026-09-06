'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { dbWrite, expenses, writeAudit } from '@natech/db';
import { parsePaisa } from '@natech/domain';
import { assertPermission, requestContext, requireOperator } from '../auth/session';

const ExpenseInput = z.object({
  incurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.'),
  category: z.string().trim().min(1, 'Choose a category.').max(80),
  vendor: z.string().trim().max(120).nullable(),
  description: z.string().trim().min(2, 'Describe the expense.').max(240),
  amount: z.string().trim().min(1),
  paymentMethod: z.enum(['CASH', 'CARD', 'WALLET', 'QR']).nullable(),
  reference: z.string().trim().max(120).nullable(),
});

export interface ExpenseActionState {
  readonly error: string | null;
  readonly message: string | null;
}
const optional = (value: FormDataEntryValue | null): string | null => {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
};

export async function createExpenseAction(
  _previous: ExpenseActionState,
  form: FormData,
): Promise<ExpenseActionState> {
  const operator = await requireOperator();
  assertPermission(operator, 'expenses.write');
  const parsed = ExpenseInput.safeParse({
    incurredOn: form.get('incurredOn'),
    category: form.get('category'),
    vendor: optional(form.get('vendor')),
    description: form.get('description'),
    amount: form.get('amount'),
    paymentMethod: optional(form.get('paymentMethod')),
    reference: optional(form.get('reference')),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Check the expense.', message: null };
  let amount;
  try {
    amount = parsePaisa(parsed.data.amount);
  } catch {
    return { error: 'Enter an amount in rupees, e.g. 1250.00.', message: null };
  }
  if (amount <= 0n) return { error: 'Expense amount must be greater than zero.', message: null };

  const context = await requestContext();
  await dbWrite().transaction(async (tx) => {
    const result = await tx
      .insert(expenses)
      .values({ ...parsed.data, amount, createdBy: operator.id })
      .returning({ id: expenses.id });
    const created = result[0];
    if (created === undefined) throw new Error('Creating the expense returned no row.');
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'expenses',
        entityId: created.id,
        action: 'EXPENSE_CREATED',
        after: {
          incurredOn: parsed.data.incurredOn,
          category: parsed.data.category,
          amount: amount.toString(),
        },
      },
    );
  });
  revalidatePath('/admin');
  revalidatePath('/admin/expenses');
  return { error: null, message: 'Expense recorded.' };
}

export async function deleteExpenseAction(id: string): Promise<void> {
  const operator = await requireOperator();
  assertPermission(operator, 'expenses.write');
  const context = await requestContext();
  await dbWrite().transaction(async (tx) => {
    const before = await tx
      .select({ id: expenses.id, amount: expenses.amount, category: expenses.category })
      .from(expenses)
      .where(and(eq(expenses.id, id), isNull(expenses.deletedAt)))
      .then((rows) => rows[0]);
    if (before === undefined) return;
    await tx
      .update(expenses)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(expenses.id, id));
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'expenses',
        entityId: id,
        action: 'EXPENSE_DELETED',
        before: { ...before, amount: before.amount.toString() },
      },
    );
  });
  revalidatePath('/admin');
  revalidatePath('/admin/expenses');
}
