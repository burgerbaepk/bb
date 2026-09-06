import 'server-only';
import { and, asc, between, desc, eq, isNull } from 'drizzle-orm';
import { dbRead, demandItems, demandSheetLines, demandSheets, users } from '@natech/db';
import { paisa, parseQty, type DemandSheetStatus } from '@natech/domain';
import type { DemandLineRow } from './total';

/**
 * Demand order sheets — ADR 0026, docs/runfiles/M23-demand-sheets.md.
 *
 * Reads only, through `dbRead` (R2). Every mutation lives in `actions.ts`.
 */

export interface DemandSheetRow {
  readonly id: string;
  readonly neededBy: string;
  readonly status: DemandSheetStatus;
  readonly supplier: string | null;
  readonly note: string | null;
  readonly createdBy: string | null;
  readonly submittedAt: Date | null;
  readonly cancelReason: string | null;
}

export type { DemandLineRow };

export interface DemandSheetDetail extends DemandSheetRow {
  readonly lines: readonly DemandLineRow[];
}

export async function readDemandSheets(from: string, to: string): Promise<DemandSheetRow[]> {
  return dbRead()
    .select({
      id: demandSheets.id,
      neededBy: demandSheets.neededBy,
      status: demandSheets.status,
      supplier: demandSheets.supplier,
      note: demandSheets.note,
      createdBy: users.displayName,
      submittedAt: demandSheets.submittedAt,
      cancelReason: demandSheets.cancelReason,
    })
    .from(demandSheets)
    .leftJoin(users, and(isNull(users.deletedAt), eq(users.id, demandSheets.createdBy)))
    .where(and(between(demandSheets.neededBy, from, to), isNull(demandSheets.deletedAt)))
    .orderBy(desc(demandSheets.neededBy), desc(demandSheets.createdAt));
}

export async function readDemandSheet(id: string): Promise<DemandSheetDetail | null> {
  const [sheet] = await dbRead()
    .select({
      id: demandSheets.id,
      neededBy: demandSheets.neededBy,
      status: demandSheets.status,
      supplier: demandSheets.supplier,
      note: demandSheets.note,
      createdBy: users.displayName,
      submittedAt: demandSheets.submittedAt,
      cancelReason: demandSheets.cancelReason,
    })
    .from(demandSheets)
    .leftJoin(users, and(isNull(users.deletedAt), eq(users.id, demandSheets.createdBy)))
    .where(and(eq(demandSheets.id, id), isNull(demandSheets.deletedAt)))
    .limit(1);
  if (sheet === undefined) return null;

  const lines = await dbRead()
    .select({
      id: demandSheetLines.id,
      item: demandSheetLines.item,
      unit: demandSheetLines.unit,
      category: demandSheetLines.category,
      qty: demandSheetLines.qty,
      estimatedUnitCost: demandSheetLines.estimatedUnitCost,
      note: demandSheetLines.note,
    })
    .from(demandSheetLines)
    .where(and(eq(demandSheetLines.sheetId, id), isNull(demandSheetLines.deletedAt)))
    .orderBy(asc(demandSheetLines.createdAt));

  return {
    ...sheet,
    // `numeric(10,3)` round-trips as a string, which is the point (R1's
    // reasoning applied to quantity): parsing it here is the only conversion.
    lines: lines.map((line) => ({
      ...line,
      qty: parseQty(line.qty),
      estimatedUnitCost: line.estimatedUnitCost === null ? null : paisa(line.estimatedUnitCost),
    })),
  };
}

export interface DemandCatalogueItem {
  readonly id: string;
  readonly name: string;
  readonly defaultUnit: string | null;
}

export interface DemandCatalogueGroup {
  readonly category: string;
  readonly items: readonly DemandCatalogueItem[];
}

/**
 * The standing checklist, grouped as the paper form prints it — M24.
 *
 * Ordered by `sortOrder` within a category so the screen reads in the order the
 * manager's eye already goes down the printed sheet. The category order is the
 * order the categories first appear, which is the column order of the form.
 */
export async function readDemandCatalogue(): Promise<DemandCatalogueGroup[]> {
  const rows = await dbRead()
    .select({
      id: demandItems.id,
      name: demandItems.name,
      category: demandItems.category,
      defaultUnit: demandItems.defaultUnit,
    })
    .from(demandItems)
    .where(isNull(demandItems.deletedAt))
    .orderBy(asc(demandItems.category), asc(demandItems.sortOrder));

  const groups = new Map<string, DemandCatalogueItem[]>();
  for (const row of rows) {
    const bucket = groups.get(row.category);
    const item = { id: row.id, name: row.name, defaultUnit: row.defaultUnit };
    if (bucket === undefined) groups.set(row.category, [item]);
    else bucket.push(item);
  }
  return [...groups].map(([category, items]) => ({ category, items }));
}
