import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { cashMovements, invoices, payments, type Tx } from '@natech/db';
import { paisa, type Paisa } from '@natech/domain';

/** Authoritative cash expected for one durably linked register shift. */
export async function computeExpectedCash(
  tx: Tx,
  shiftId: string,
  openingFloat: Paisa,
): Promise<Paisa> {
  const [paymentRows, movementRows] = await Promise.all([
    tx
      .select({ amount: payments.amount })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(
        and(
          eq(invoices.shiftId, shiftId),
          eq(payments.method, 'CASH'),
          eq(payments.attemptStatus, 'APPROVED'),
          isNull(payments.deletedAt),
          isNull(invoices.deletedAt),
        ),
      ),
    tx
      .select({ type: cashMovements.type, amount: cashMovements.amount })
      .from(cashMovements)
      .where(and(eq(cashMovements.shiftId, shiftId), isNull(cashMovements.deletedAt))),
  ]);
  const cashPayments = paymentRows.reduce((running, row) => running + row.amount, 0n);
  const movementNet = movementRows.reduce(
    (running, row) => running + (row.type === 'PAY_IN' ? row.amount : -row.amount),
    0n,
  );
  return paisa(openingFloat + cashPayments + movementNet);
}
