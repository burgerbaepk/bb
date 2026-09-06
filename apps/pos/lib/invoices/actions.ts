'use server';

import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { dbWrite, invoices, writeAudit } from '@natech/db';
import { assertPermission, requestContext, requireOperator } from '../auth/session';

const Input = z.object({ id: z.uuid() });

export async function recordInvoiceReprintAction(
  id: string,
): Promise<{ ok: boolean; error: string | null }> {
  const operator = await requireOperator();
  assertPermission(operator, 'reports.read');
  const parsed = Input.safeParse({ id });
  if (!parsed.success) return { ok: false, error: 'Invalid invoice.' };
  const context = await requestContext();
  const db = dbWrite();
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: invoices.id, localNo: invoices.localNo, printedCount: invoices.printedCount })
      .from(invoices)
      .where(eq(invoices.id, parsed.data.id));
    const row = rows[0];
    if (!row) return { ok: false, error: 'Invoice not found.' };
    await tx
      .update(invoices)
      .set({ printedCount: sql`${invoices.printedCount} + 1` })
      .where(eq(invoices.id, row.id));
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'invoices',
        entityId: row.id,
        action: 'INVOICE_REPRINTED',
        before: { printedCount: row.printedCount },
        after: { printedCount: row.printedCount + 1, localNo: row.localNo },
      },
    );
    return { ok: true, error: null };
  });
}
