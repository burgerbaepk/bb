'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  dbWrite,
  demandItems,
  stockMovements,
  writeAudit,
  type AuditContext,
  type Tx,
} from '@natech/db';
import { parseQty, qty, qtyToString, type Qty } from '@natech/domain';
import { assertPermission, requestContext, requireOperator } from '../auth/session';
import { currentBusinessDate } from '../orders/businessDate';
import { collectCounts, movementDelta, refuseMovement, type StockKind } from './ledger';

/**
 * The stock ledger — ADR 0034, docs/runfiles/M28-stock-ledger.md.
 *
 * `expenses.write` for every write, `reports.read` to read, as M23. Both
 * actions lock the catalogue rows they touch `FOR UPDATE` before reading the
 * book, so two issues saved at once cannot both pass the below-zero check, and
 * a count cannot compute its variance against a book another write is moving.
 * Everything is one `dbWrite` transaction with its audit rows (R2, R7).
 */

export interface StockActionState {
  readonly error: string | null;
  readonly message: string | null;
}

const optional = (value: FormDataEntryValue | null): string | null => {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
};

const MovementInput = z.object({
  itemId: z.uuid('Choose an item.'),
  // Counts come only from the count sheet (runfile §3).
  kind: z.enum(['RECEIVED', 'ISSUED', 'WASTED']),
  qty: z.string().trim().min(1, 'Enter a quantity.'),
  unit: z.string().trim().max(32).nullable(),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.'),
  note: z.string().trim().max(240).nullable(),
});

class Refusal extends Error {}

/** The book per item, read through the caller's transaction after its lock. */
async function readBooks(tx: Tx, itemIds: readonly string[]): Promise<Map<string, Qty>> {
  if (itemIds.length === 0) return new Map();
  const rows = await tx
    .select({ itemId: stockMovements.itemId, total: sql<string>`sum(${stockMovements.delta})` })
    .from(stockMovements)
    .where(and(inArray(stockMovements.itemId, [...itemIds]), isNull(stockMovements.deletedAt)))
    .groupBy(stockMovements.itemId);
  return new Map(rows.map((row) => [row.itemId, parseQty(row.total)]));
}

/** ADR 0034 — the first movement gives an item its unit, on the catalogue row. */
async function saveUnit(tx: Tx, audit: AuditContext, itemId: string, unit: string) {
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

async function insertMovement(
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

export async function recordStockMovementAction(
  _previous: StockActionState,
  form: FormData,
): Promise<StockActionState> {
  const operator = await requireOperator();
  assertPermission(operator, 'expenses.write');
  const parsed = MovementInput.safeParse({
    itemId: form.get('itemId'),
    kind: form.get('kind'),
    qty: form.get('qty'),
    unit: optional(form.get('unit')),
    occurredOn: form.get('occurredOn'),
    note: optional(form.get('note')),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Check the movement.', message: null };
  const input = parsed.data;
  let quantity: Qty;
  try {
    quantity = parseQty(input.qty);
  } catch {
    return { error: 'Enter a quantity, e.g. 20 or 0.25. Three decimals at most.', message: null };
  }

  const context = await requestContext();
  const audit = { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined };
  try {
    const name = await dbWrite().transaction(async (tx) => {
      const [item] = await tx
        .select({ name: demandItems.name, unit: demandItems.defaultUnit })
        .from(demandItems)
        .where(and(eq(demandItems.id, input.itemId), isNull(demandItems.deletedAt)))
        .for('update');
      if (item === undefined) throw new Refusal('That item is no longer on the list.');
      const book = (await readBooks(tx, [input.itemId])).get(input.itemId) ?? qty(0n);
      // A saved unit is never overwritten from here: changing kg to piece on an
      // item with history would silently reinterpret every row before it.
      const unit = item.unit ?? input.unit;
      const refusal = refuseMovement({
        name: item.name,
        kind: input.kind,
        quantity,
        book,
        unit,
        note: input.note,
        occurredOn: input.occurredOn,
        today: await currentBusinessDate(tx),
      });
      if (refusal !== null) throw new Refusal(refusal);
      if (item.unit === null && unit !== null) await saveUnit(tx, audit, input.itemId, unit);
      await insertMovement(tx, audit, {
        itemId: input.itemId,
        kind: input.kind,
        quantity,
        delta: movementDelta(input.kind, quantity, book),
        book,
        occurredOn: input.occurredOn,
        note: input.note,
        recordedBy: operator.id,
      });
      return item.name;
    });
    revalidatePath('/admin/stock');
    return { error: null, message: `${name} recorded.` };
  } catch (error) {
    if (error instanceof Refusal) return { error: error.message, message: null };
    throw error;
  }
}

/**
 * Save a count sheet: one `COUNTED` row per filled box, dated today.
 *
 * All or nothing. A sheet with one bad box saves none of it, so the manager is
 * never left wondering which half of a walk-round went in. A count equal to the
 * book is still written — "checked, and right" is information too.
 */
export async function recordStockCountAction(
  _previous: StockActionState,
  form: FormData,
): Promise<StockActionState> {
  const operator = await requireOperator();
  assertPermission(operator, 'expenses.write');
  const context = await requestContext();
  const audit = { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined };

  try {
    const saved = await dbWrite().transaction(async (tx) => {
      // Names and units from the database, never the payload, as the demand
      // grid does. Locked, because every item on the sheet may be written.
      const items = await tx
        .select({ id: demandItems.id, name: demandItems.name, unit: demandItems.defaultUnit })
        .from(demandItems)
        .where(isNull(demandItems.deletedAt))
        .for('update');
      const { lines, errors } = collectCounts(
        items.map((item) => ({
          itemId: item.id,
          name: item.name,
          savedUnit: item.unit,
          rawQty: String(form.get(`count:${item.id}`) ?? ''),
          rawUnit: String(form.get(`unit:${item.id}`) ?? ''),
        })),
      );
      const today = await currentBusinessDate(tx);
      const books = await readBooks(
        tx,
        lines.map((line) => line.itemId),
      );
      const problems = [...errors];
      for (const line of lines) {
        const refusal = refuseMovement({
          name: line.name,
          kind: 'COUNTED',
          quantity: line.quantity,
          book: books.get(line.itemId) ?? qty(0n),
          unit: line.unit,
          note: null,
          occurredOn: today,
          today,
        });
        if (refusal !== null) problems.push(refusal);
      }
      if (problems.length > 0) throw new Refusal(problems.slice(0, 3).join(' '));
      if (lines.length === 0) throw new Refusal('Nothing was counted. Fill in at least one box.');

      for (const line of lines) {
        const book = books.get(line.itemId) ?? qty(0n);
        if (line.newUnit !== null) await saveUnit(tx, audit, line.itemId, line.newUnit);
        await insertMovement(tx, audit, {
          itemId: line.itemId,
          kind: 'COUNTED',
          quantity: line.quantity,
          delta: movementDelta('COUNTED', line.quantity, book),
          book,
          occurredOn: today,
          note: null,
          recordedBy: operator.id,
        });
      }
      return lines.length;
    });
    revalidatePath('/admin/stock');
    return { error: null, message: `Count saved for ${saved} ${saved === 1 ? 'item' : 'items'}.` };
  } catch (error) {
    if (error instanceof Refusal) return { error: error.message, message: null };
    throw error;
  }
}
