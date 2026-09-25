import 'server-only';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { dbRead, demandItems, stockMovements, users } from '@natech/db';
import { parseQty, qty, type Qty } from '@natech/domain';
import type { StockKind } from './ledger';

/**
 * The stock ledger — ADR 0034. Reads only, through `dbRead` (R2).
 *
 * On-hand is summed in SQL from `stock_movements.delta` on every read. There is
 * no cache and no stored column to fall out of step with it.
 */

export interface StockRow {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly unit: string | null;
  /** Null for an item that has never had a movement — not tracked, not zero. */
  readonly onHand: Qty | null;
  readonly lastMovedOn: string | null;
}

export async function readStock(): Promise<StockRow[]> {
  const rows = await dbRead()
    .select({
      id: demandItems.id,
      name: demandItems.name,
      category: demandItems.category,
      unit: demandItems.defaultUnit,
      // Raw aggregates come back as driver strings, not mapped values.
      onHand: sql<string | null>`sum(${stockMovements.delta})`,
      lastMovedOn: sql<string | null>`max(${stockMovements.occurredOn})::text`,
    })
    .from(demandItems)
    .leftJoin(
      stockMovements,
      and(eq(stockMovements.itemId, demandItems.id), isNull(stockMovements.deletedAt)),
    )
    .where(isNull(demandItems.deletedAt))
    .groupBy(demandItems.id)
    .orderBy(asc(demandItems.category), asc(demandItems.sortOrder));
  return rows.map((row) => ({
    ...row,
    onHand: row.onHand === null ? null : parseQty(row.onHand),
  }));
}

export interface StockHistoryRow {
  readonly id: string;
  readonly occurredOn: string;
  readonly kind: StockKind;
  readonly quantity: Qty;
  readonly delta: Qty;
  /** The book after this row, oldest first — so a count's variance reads in context. */
  readonly balance: Qty;
  readonly note: string | null;
  readonly recordedBy: string | null;
}

export async function readItemHistory(itemId: string): Promise<{
  item: { id: string; name: string; category: string; unit: string | null };
  rows: StockHistoryRow[];
} | null> {
  const [item] = await dbRead()
    .select({
      id: demandItems.id,
      name: demandItems.name,
      category: demandItems.category,
      unit: demandItems.defaultUnit,
    })
    .from(demandItems)
    .where(and(eq(demandItems.id, itemId), isNull(demandItems.deletedAt)));
  if (item === undefined) return null;

  const movements = await dbRead()
    .select({
      id: stockMovements.id,
      occurredOn: stockMovements.occurredOn,
      kind: stockMovements.kind,
      qty: stockMovements.qty,
      delta: stockMovements.delta,
      note: stockMovements.note,
      recordedBy: users.displayName,
    })
    .from(stockMovements)
    .leftJoin(users, eq(users.id, stockMovements.recordedBy))
    .where(and(eq(stockMovements.itemId, itemId), isNull(stockMovements.deletedAt)))
    // Entry order, not `occurred_on`: the running balance must match the book
    // each movement was checked against when it was written.
    .orderBy(asc(stockMovements.createdAt));

  let balance = qty(0n);
  const rows = movements.map(({ qty: quantity, delta, ...row }) => {
    const d = parseQty(delta);
    balance = qty(balance + d);
    return { ...row, quantity: parseQty(quantity), delta: d, balance };
  });
  return { item, rows: rows.reverse() };
}
