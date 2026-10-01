import { and, eq, isNull, notInArray } from 'drizzle-orm';
import { orders, tables, writeAudit, type AuditContext, type Tx } from '@natech/db';
import { tableMachine, type TableStatus } from '@natech/domain';

const ACTIVE_SERVICE_STATUSES: readonly TableStatus[] = ['SEATED', 'ORDERED', 'SERVED', 'PAYING'];

/**
 * Free the table if the order just closed without an invoice was its last
 * open one — `voidOrderAction`, and `recordInfluencerMealAction` (ADR 0038).
 * Lifted out of the void action unchanged so the two cannot drift; it lives
 * outside the `'use server'` module because an export there is a public
 * endpoint.
 *
 * A table left in ORDERED/SERVED/PAYING after its only order is voided
 * otherwise keeps offering Take Payment for an order that no longer exists,
 * and the floor plan reads as still occupied when it is not (2026-08-27; the
 * reported "Table 9 still shows Take Payment" symptom). Skipped entirely when
 * the table is BLOCKED, RESERVED, or already FREE/CLEANING — those are states
 * a manager set on purpose, not a side effect of *this* order dying.
 */
export async function releaseTableIfIdle(
  tx: Tx,
  tableId: string,
  audit: AuditContext,
): Promise<void> {
  const stillOpen = await tx
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.tableId, tableId),
        isNull(orders.deletedAt),
        notInArray(orders.status, ['FINALIZED', 'VOIDED']),
      ),
    )
    .limit(1);
  if (stillOpen.length > 0) return;

  const tableRows = await tx
    .select({ status: tables.status })
    .from(tables)
    .where(and(eq(tables.id, tableId), isNull(tables.deletedAt)));
  const persistedTableStatus = tableRows[0]?.status as TableStatus | 'CHECK_PRINTED' | undefined;
  const currentTableStatus =
    persistedTableStatus === 'CHECK_PRINTED' ? 'SERVED' : persistedTableStatus;
  if (currentTableStatus === undefined || !ACTIVE_SERVICE_STATUSES.includes(currentTableStatus))
    return;

  const nextTableStatus: TableStatus = tableMachine.can(currentTableStatus, 'FREE')
    ? 'FREE'
    : 'CLEANING';
  await tx
    .update(tables)
    .set({ status: nextTableStatus, statusChangedAt: new Date(), updatedAt: new Date() })
    .where(eq(tables.id, tableId));
  await writeAudit(tx, audit, {
    entity: 'tables',
    entityId: tableId,
    action: 'TABLE_FREED_AFTER_VOID',
    before: { status: persistedTableStatus },
    after: { status: nextTableStatus },
  });
}
