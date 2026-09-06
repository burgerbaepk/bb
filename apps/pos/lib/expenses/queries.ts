import 'server-only';
import { and, between, desc, eq, isNull } from 'drizzle-orm';
import { dbRead, expenses, users } from '@natech/db';
import { paisa, sum, type Paisa } from '@natech/domain';

export interface ExpenseRow {
  readonly id: string;
  readonly incurredOn: string;
  readonly category: string;
  readonly vendor: string | null;
  readonly description: string;
  readonly amount: Paisa;
  readonly paymentMethod: 'CASH' | 'CARD' | 'WALLET' | 'QR' | null;
  readonly reference: string | null;
  readonly createdBy: string | null;
}

export async function readExpenses(from: string, to: string): Promise<ExpenseRow[]> {
  const rows = await dbRead()
    .select({
      id: expenses.id,
      incurredOn: expenses.incurredOn,
      category: expenses.category,
      vendor: expenses.vendor,
      description: expenses.description,
      amount: expenses.amount,
      paymentMethod: expenses.paymentMethod,
      reference: expenses.reference,
      createdBy: users.displayName,
    })
    .from(expenses)
    .leftJoin(users, and(isNull(users.deletedAt), eq(users.id, expenses.createdBy)))
    .where(and(between(expenses.incurredOn, from, to), isNull(expenses.deletedAt)))
    .orderBy(desc(expenses.incurredOn), desc(expenses.createdAt));
  return rows.map((row) => ({ ...row, amount: paisa(row.amount) }));
}

export function expenseTotal(rows: readonly ExpenseRow[]): Paisa {
  return sum(rows.map((row) => row.amount));
}
