import { eq } from 'drizzle-orm';
import { invoiceCounter } from './schema';
import type { Tx } from './tx';

/**
 * Document number allocation — BUILD-PLAN.md §5.8.
 *
 * The counter is a single row locked `SELECT ... FOR UPDATE` inside the
 * caller's transaction. Deliberately not a Postgres sequence: a sequence hands
 * out a number and keeps it even if the transaction rolls back, and a fiscal
 * audit asks about gaps. Under a row lock, a rollback returns the number.
 *
 * The lock serialises concurrent finalizes on the same row, which is the point.
 * Two tills finalizing at once will queue for a few milliseconds rather than
 * both being handed INV-000482.
 */

const PAD_WIDTH = 6;

function format(prefix: string, value: bigint): string {
  return `${prefix}${value.toString().padStart(PAD_WIDTH, '0')}`;
}

/**
 * §5.8 — gap-free, monotonic, never resets, never reused.
 *
 * Must be called inside the finalize transaction. Calling it outside one takes
 * the lock and releases it immediately, which defeats the purpose.
 */
export async function allocateLocalNo(tx: Tx): Promise<string> {
  const [row] = await tx
    .select({ next: invoiceCounter.nextValue, prefix: invoiceCounter.prefix })
    .from(invoiceCounter)
    .for('update');

  if (row === undefined) {
    throw new Error('invoice_counter has no row. Run the seed before finalizing an invoice.');
  }

  await tx
    .update(invoiceCounter)
    .set({ nextValue: row.next + 1n, updatedAt: new Date() })
    .where(eq(invoiceCounter.singleton, true));

  return format(row.prefix, row.next);
}
