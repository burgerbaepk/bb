import 'server-only';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { demandItems, stockMovements, writeAudit, type AuditContext, type Tx } from '@natech/db';
import { parseQty, qtyToString, type Qty } from '@natech/domain';
import type { StockKind } from './ledger';

/**
 * The stock ledger's write helpers — ADR 0034, ADR 0035.
 *
 * Moved out of `actions.ts` when supplier bills (M29) started posting their
 * goods into the same book. They cannot stay in a `'use server'` module: every
 * export of one is a callable endpoint, and an unauthenticated
 * `insertMovement` would let anybody write stock. Each helper runs inside the
 * caller's transaction, after the caller has taken its `FOR UPDATE` lock on
 * the catalogue rows.
 */

/** The book per item, read through the caller's transaction after its lock. */
export async function readBooks(tx: Tx, itemIds: readonly string[]): Promise<Map<string, Qty>> {
  if (itemIds.length === 0) return new Map();
  const rows = await tx
    .select({ itemId: stockMovements.itemId, total: sql<string>`sum(${stockMovements.delta})` })
    .from(stockMovements)
    .where(and(inArray(stockMovements.itemId, [...itemIds]), isNull(stockMovements.deletedAt)))
    .groupBy(stockMovements.itemId);
  return new Map(rows.map((row) => [row.itemId, parseQty(row.total)]));
}

/** ADR 0034 — the first movement gives an item its unit, on the catalogue row. */
export async function saveUnit(tx: Tx, audit: AuditContext, itemId: string, unit: string) {
  await tx
    .update(demandItems)
    .set({ defaultUnit: unit, updatedAt: new Date() })
    .where(eq(demandItems.id, itemId));
  await writeAudit(tx, audit, {
    entity: 'demand_items',
    entityId: itemId,
    action: 'DEMAND_ITEM_UNIT_SET',
    before: { defaultUnit: null },
    after: { defaultUnit: unit },
  });
}

export async function insertMovement(
  tx: Tx,
  audit: AuditContext,
  row: {
    itemId: string;
    kind: StockKind;
    quantity: Qty;
    delta: Qty;
    book: Qty;
    occurredOn: string;
    note: string | null;
    recordedBy: string;
  },
) {
  const [created] = await tx
    .insert(stockMovements)
    .values({
      itemId: row.itemId,
      kind: row.kind,
      qty: qtyToString(row.quantity),
      delta: qtyToString(row.delta),
      occurredOn: row.occurredOn,
      note: row.note,
      recordedBy: row.recordedBy,
    })
    .returning({ id: stockMovements.id });
  if (created === undefined) throw new Error('Recording the stock movement returned no row.');
  await writeAudit(tx, audit, {
    entity: 'stock_movements',
    entityId: created.id,
    action: `STOCK_${row.kind}`,
    after: {
      itemId: row.itemId,
      qty: qtyToString(row.quantity),
      delta: qtyToString(row.delta),
      bookBefore: qtyToString(row.book),
      occurredOn: row.occurredOn,
      note: row.note,
    },
  });
}
