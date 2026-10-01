import 'server-only';
import { and, asc, between, desc, eq, isNull } from 'drizzle-orm';
import { dbRead, expenses, orders, users } from '@natech/db';
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
  /** ADR 0038 — set on an influencer meal; such a row cannot be deleted here. */
  readonly orderNo: number | null;
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
      orderNo: orders.orderNo,
    })
    .from(expenses)
    .leftJoin(users, and(isNull(users.deletedAt), eq(users.id, expenses.createdBy)))
    .leftJoin(orders, eq(orders.id, expenses.orderId))
    .where(and(between(expenses.incurredOn, from, to), isNull(expenses.deletedAt)))
    .orderBy(desc(expenses.incurredOn), desc(expenses.createdAt));
  return rows.map((row) => ({ ...row, amount: paisa(row.amount) }));
}

/**
 * Every category ever used, all time — not only the ninety days on screen, or
 * a category used once in spring comes back as a new spelling in summer. The
 * dropdown on the expense form is built from this; `resolveCategory` is what
 * actually stops a duplicate.
 */
export async function readExpenseCategories(): Promise<string[]> {
  const rows = await dbRead()
    .selectDistinct({ category: expenses.category })
    .from(expenses)
    .where(isNull(expenses.deletedAt))
    .orderBy(asc(expenses.category));
  return rows.map((row) => row.category);
}

export function expenseTotal(rows: readonly ExpenseRow[]): Paisa {
  return sum(rows.map((row) => row.amount));
}
