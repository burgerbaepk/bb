import 'server-only';
import { and, inArray, isNull } from 'drizzle-orm';
import {
  dbRead,
  orderLineModifiers,
  orderLines,
  orders,
  tableSessions,
  tables,
  taxClasses,
  users,
  zones,
} from '@natech/db';
import { linesSubtotal, paisa, parseQty, priceLines, type Paisa } from '@natech/domain';
import {
  can,
  type FloorTable,
  type TableChip,
  type TableChipMoney,
  type TableStatus,
  type TaxClassKey,
  type Viewer,
  type Zone,
} from '@natech/contracts';
import { initialsOf } from '../auth/queries';
import { workableOrder } from '../orders/workable';

/** Mirrors `lib/orders/actions.ts`'s own fallback for a line with no resolved tax class. */
const DEFAULT_TAX_CLASS_KEY: TaxClassKey = 'STANDARD_FOOD';

/**
 * Keep reads compatible while migration 0007 is being rolled out. A check
 * that had already been printed is still a served table after ADR 0019;
 * payment is not considered open until the operator actually opens it.
 */
function currentTableStatus(status: TableStatus | 'CHECK_PRINTED'): TableStatus {
  return status === 'CHECK_PRINTED' ? 'SERVED' : status;
}

/**
 * Floor reads — BUILD-PLAN.md §5.5, §9.4.
 *
 * `dbRead` throughout (R2): everything here answers the floor editor page, a
 * React Server Component. Every mutation lives in `actions.ts`, behind
 * `dbWrite`.
 *
 * Soft-deleted zones and tables (R6) never surface here — a deleted zone
 * cannot receive a table, and a deleted table cannot be found on a plan
 * nobody can open it from.
 */

export async function listZones(): Promise<Zone[]> {
  const rows = await dbRead()
    .select({
      id: zones.id,
      name: zones.name,
      nameUr: zones.nameUr,
      sortOrder: zones.sortOrder,
      gridCols: zones.gridCols,
      gridRows: zones.gridRows,
      backgroundImageKey: zones.backgroundImageKey,
      isActive: zones.isActive,
    })
    .from(zones)
    .where(isNull(zones.deletedAt))
    .orderBy(zones.sortOrder, zones.name);

  return rows;
}

/**
 * Flattens the DB's `x`/`y`/`width`/`height`/`rotation` columns into the
 * frozen `FloorTable.geometry` shape `FloorEditor` expects — the one mapping
 * step between §5.5's row and §9's contract. No unit conversion happens here:
 * both sides already agree on grid cells (§9.3).
 */
export async function listTables(): Promise<FloorTable[]> {
  const rows = await dbRead()
    .select({
      id: tables.id,
      zoneId: tables.zoneId,
      code: tables.code,
      minSeats: tables.minSeats,
      maxSeats: tables.maxSeats,
      shape: tables.shape,
      x: tables.x,
      y: tables.y,
      width: tables.width,
      height: tables.height,
      rotation: tables.rotation,
      status: tables.status,
      statusChangedAt: tables.statusChangedAt,
      mergedIntoId: tables.mergedIntoId,
    })
    .from(tables)
    .where(isNull(tables.deletedAt))
    .orderBy(tables.code);

  return rows.map((row) => ({
    id: row.id,
    zoneId: row.zoneId,
    code: row.code,
    minSeats: row.minSeats,
    maxSeats: row.maxSeats,
    shape: row.shape,
    geometry: {
      x: row.x,
      y: row.y,
      width: row.width,
      height: row.height,
      rotation: row.rotation,
    },
    status: currentTableStatus(row.status as TableStatus | 'CHECK_PRINTED'),
    statusChangedAt: row.statusChangedAt,
    mergedIntoId: row.mergedIntoId,
  }));
}

export interface Floor {
  readonly zones: readonly Zone[];
  readonly tables: readonly FloorTable[];
}

/** What `admin/floor/page.tsx` needs in one round trip. */
export async function listFloor(): Promise<Floor> {
  const [zoneRows, tableRows] = await Promise.all([listZones(), listTables()]);
  return { zones: zoneRows, tables: tableRows };
}

/* --------------------------------------------------------------- live chips */

/**
 * The service-mode floor plan's chips — BUILD-PLAN.md §9.2;
 * docs/runfiles/M09b-floor-live.md §3.
 *
 * Mirrors `packages/contracts/mocks/floor.ts`'s `tableChips()` formula exactly
 * (same `maySeeMoney` predicate, same subtotal source), so the transition
 * from mock to real data changes nothing about what the numbers mean — only
 * where they come from. Money is priced through `@natech/domain`'s
 * `priceLines`/`linesSubtotal`, never hand-summed, for the same reason
 * `orderSubtotal` is (§3's decision).
 *
 * A merged secondary table (`mergedIntoId !== null`) contributes nothing of
 * its own here — zero seated, no money — so R16's summary
 * bar (computed downstream, over these same chips) cannot double-count a
 * party across both halves of a merge. Its status mirrors its primary's, so
 * the shape on the canvas reads correctly; `FloorPlan` separately excludes it
 * from the summary math using `FloorTable.mergedIntoId`, which this function's
 * caller already holds.
 */
export async function listFloorChips(viewer: Viewer): Promise<readonly TableChip[]> {
  const maySeeMoney = can(viewer, 'payment.take') || can(viewer, 'reports.read');
  const db = dbRead();

  const [zoneRows, tableRows] = await Promise.all([listZones(), listTables()]);
  const zoneNameById = new Map(zoneRows.map((zone) => [zone.id, zone.name]));
  const tableById = new Map(tableRows.map((table) => [table.id, table]));

  const [sessionRows, openOrderRows, taxClassRows, userRows] = await Promise.all([
    db
      .select({
        tableId: tableSessions.tableId,
        openedAt: tableSessions.openedAt,
        guestCount: tableSessions.guestCount,
        waiterId: tableSessions.waiterId,
      })
      .from(tableSessions)
      .where(isNull(tableSessions.closedAt)),
    db
      .select({ id: orders.id, tableId: orders.tableId })
      .from(orders)
      // §13.4 — a web order nobody has accepted yet must not seat a table or
      // turn its chip to ORDERED. See `lib/orders/workable.ts`.
      .where(workableOrder()),
    db.select({ id: taxClasses.id, key: taxClasses.key }).from(taxClasses),
    db.select({ id: users.id, displayName: users.displayName }).from(users),
  ]);

  const sessionByTable = new Map(sessionRows.map((row) => [row.tableId, row]));
  const taxKeyById = new Map(taxClassRows.map((row) => [row.id, row.key as TaxClassKey]));
  const userNameById = new Map(userRows.map((row) => [row.id, row.displayName]));

  const openOrdersByTable = new Map<string, string[]>();
  for (const row of openOrderRows) {
    if (row.tableId === null) continue;
    const bucket = openOrdersByTable.get(row.tableId) ?? [];
    bucket.push(row.id);
    openOrdersByTable.set(row.tableId, bucket);
  }

  const orderIds = openOrderRows.map((row) => row.id);
  const [lineRows, modifierRows] = await Promise.all([
    orderIds.length === 0
      ? []
      : db
          .select({
            id: orderLines.id,
            orderId: orderLines.orderId,
            nameSnapshot: orderLines.nameSnapshot,
            qty: orderLines.qty,
            unitPrice: orderLines.unitPrice,
            lineDiscount: orderLines.lineDiscount,
            taxClassId: orderLines.taxClassId,
            voidReason: orderLines.voidReason,
          })
          .from(orderLines)
          .where(and(inArray(orderLines.orderId, orderIds), isNull(orderLines.deletedAt))),
    orderIds.length === 0
      ? []
      : db
          .select({
            orderLineId: orderLineModifiers.orderLineId,
            nameSnapshot: orderLineModifiers.nameSnapshot,
            priceDelta: orderLineModifiers.priceDelta,
          })
          .from(orderLineModifiers)
          .where(isNull(orderLineModifiers.deletedAt)),
  ]);

  const modifiersByLine = new Map<string, { name: string; priceDelta: Paisa }[]>();
  for (const row of modifierRows) {
    const bucket = modifiersByLine.get(row.orderLineId) ?? [];
    bucket.push({ name: row.nameSnapshot, priceDelta: paisa(row.priceDelta) });
    modifiersByLine.set(row.orderLineId, bucket);
  }
  const linesByOrder = new Map<string, typeof lineRows>();
  for (const line of lineRows) {
    const bucket = linesByOrder.get(line.orderId) ?? [];
    bucket.push(line);
    linesByOrder.set(line.orderId, bucket);
  }

  /** One table's own subtotal, across all its open orders (a table can hold more than one — M09a §4's second-round gap). */
  function ownFigures(tableId: string): { subtotal: Paisa } {
    const domainLines = [];

    for (const orderId of openOrdersByTable.get(tableId) ?? []) {
      for (const line of linesByOrder.get(orderId) ?? []) {
        if (line.voidReason !== null) continue;

        domainLines.push({
          id: line.id,
          name: line.nameSnapshot,
          taxClass: taxKeyById.get(line.taxClassId ?? '') ?? DEFAULT_TAX_CLASS_KEY,
          unitPrice: paisa(line.unitPrice),
          qty: parseQty(line.qty),
          lineDiscount: paisa(line.lineDiscount),
          modifiers: modifiersByLine.get(line.id) ?? [],
        });
      }
    }

    return { subtotal: linesSubtotal(priceLines(domainLines)) };
  }

  return tableRows.map((table): TableChip => {
    const primaryId = table.mergedIntoId ?? table.id;
    const isSecondary = table.mergedIntoId !== null;
    const primary = tableById.get(primaryId) ?? table;

    const zoneName = zoneNameById.get(table.zoneId) ?? '';
    const memberCodes = isSecondary
      ? [primary.code]
      : tableRows.filter((t) => t.mergedIntoId === table.id).map((t) => t.code);

    if (isSecondary) {
      // §3's decision — a merged-away table contributes nothing of its own:
      // its status mirrors the primary so the canvas shape is not
      // misleadingly `FREE`, but every count and figure is zero so the
      // summary bar, computed over every chip including this one, cannot
      // double-count the party it belongs to.
      return {
        tableId: table.id,
        code: table.code,
        zoneName,
        status: primary.status,
        maxSeats: table.maxSeats,
        seatedCount: 0,
        dwellSeconds: 0,
        waiterInitials: null,
        money: null,
        memberCodes,
      };
    }

    const session = sessionByTable.get(table.id) ?? null;
    const waiterName =
      session === null || session.waiterId === null
        ? null
        : (userNameById.get(session.waiterId) ?? null);
    const dwellSeconds =
      session === null
        ? 0
        : Math.max(0, Math.floor((Date.now() - session.openedAt.getTime()) / 1000));
    const { subtotal } = ownFigures(table.id);
    const hasOpenOrder = openOrdersByTable.has(table.id);

    // ADR 0019 — `Subtotal (ex tax)` is the only figure a table ever shows;
    // the real total is not knowable until the customer pays.
    const money: TableChipMoney | null =
      !maySeeMoney || !hasOpenOrder ? null : { amount: subtotal };

    return {
      tableId: table.id,
      code: table.code,
      zoneName,
      status: table.status,
      maxSeats: table.maxSeats,
      seatedCount: session?.guestCount ?? 0,
      dwellSeconds,
      waiterInitials: waiterName === null ? null : initialsOf(waiterName),
      money,
      memberCodes,
    };
  });
}
