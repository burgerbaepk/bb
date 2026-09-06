'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { dbWrite, qrTokens, tables, writeAudit } from '@natech/db';
import { assertPermission, requestContext, requireOperator } from '../auth/session';

async function managerContext() {
  const operator = await requireOperator();
  assertPermission(operator, 'floor.write');
  return { operator, context: await requestContext() };
}

function newToken(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

export async function generateMissingTableQrCodesAction(): Promise<void> {
  const { operator, context } = await managerContext();
  const db = dbWrite();
  await db.transaction(async (tx) => {
    const tableRows = await tx
      .select({ id: tables.id })
      .from(tables)
      .leftJoin(
        qrTokens,
        and(
          eq(qrTokens.tableId, tables.id),
          eq(qrTokens.isActive, true),
          isNull(qrTokens.deletedAt),
        ),
      )
      .where(and(isNull(tables.deletedAt), isNull(qrTokens.id)));
    for (const table of tableRows) {
      const [created] = await tx
        .insert(qrTokens)
        .values({ tableId: table.id, token: newToken() })
        .returning({ id: qrTokens.id });
      if (created === undefined) throw new Error('Creating a table QR token returned no row.');
      await writeAudit(
        tx,
        { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
        {
          entity: 'qr_tokens',
          entityId: created.id,
          action: 'TABLE_QR_CREATED',
          after: { tableId: table.id },
        },
      );
    }
  });
  revalidatePath('/admin/table-qr');
}

export async function rotateTableQrCodeAction(form: FormData): Promise<void> {
  const tableId = form.get('tableId');
  if (typeof tableId !== 'string' || tableId === '') throw new Error('A table is required.');
  const { operator, context } = await managerContext();
  const db = dbWrite();
  await db.transaction(async (tx) => {
    const [table] = await tx
      .select({ id: tables.id })
      .from(tables)
      .where(and(eq(tables.id, tableId), isNull(tables.deletedAt)));
    if (table === undefined) throw new Error('That table no longer exists.');
    await tx
      .update(qrTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(qrTokens.tableId, tableId), eq(qrTokens.isActive, true)));
    const [created] = await tx
      .insert(qrTokens)
      .values({ tableId, token: newToken() })
      .returning({ id: qrTokens.id });
    if (created === undefined) throw new Error('Creating a table QR token returned no row.');
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'qr_tokens',
        entityId: created.id,
        action: 'TABLE_QR_ROTATED',
        after: { tableId },
      },
    );
  });
  revalidatePath('/admin/table-qr');
}
