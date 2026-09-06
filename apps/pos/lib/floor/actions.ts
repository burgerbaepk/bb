'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, inArray, isNull, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { dbWrite, orders, tableSessions, tables, writeAudit, zones } from '@natech/db';
import { TableShapeSchema } from '@natech/contracts';
import { IllegalTransitionError, tableMachine, type TableStatus } from '@natech/domain';
import { FLOOR_CHANNEL, getRealtime } from '@natech/realtime';
import {
  Forbidden,
  Locked,
  NotSignedIn,
  assertPermission,
  requestContext,
  requireOperator,
  requireTillStaff,
} from '../auth/session';
import type { TillIdentity } from '../auth/session';
import { findBoundsViolation, type ZoneBoundsLike } from './bounds';

/**
 * Floor writes — BUILD-PLAN.md §5.5, §9.4; docs/runfiles/M08-menu-floor-brand.md §3.
 *
 * Mirrors `lib/auth/actions/staff.ts`: Zod input, `requireOperator()`
 * then `assertPermission`, `dbWrite()`, a transaction wrapping the mutation
 * plus one `writeAudit` row (R7), `revalidatePath()`. `floor.write` is the one
 * permission gating everything below — §14.1 gives it to `MANAGER` and
 * `OWNER`.
 */

const FLOOR_WRITE = 'floor.write' as const;

export interface FloorFormState {
  readonly error: string | null;
  readonly message: string | null;
}

/**
 * Drizzle wraps the driver error (CLAUDE.md, "Traps found the hard way"): the
 * Postgres message naming the failing constraint is on `error.cause`, not
 * `error.message`. `zones_name_idx` and `tables_zone_code_idx` are both
 * partial-unique `WHERE deleted_at IS NULL` (R6), and either one firing here
 * is an operator-facing form error, not a server crash.
 */
function friendlyConstraintError(error: unknown): string | null {
  const cause = error instanceof Error ? error.cause : undefined;
  const message = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : '';

  if (message.includes('zones_name_idx')) {
    return 'A zone with that name already exists.';
  }
  if (message.includes('tables_zone_code_idx')) {
    return 'That table code is already used in this zone. Codes only need to be unique within a zone.';
  }
  return null;
}

/* -------------------------------------------------------------- zones */

const CreateZoneInput = z.object({
  name: z.string().trim().min(1, 'A zone needs a name.'),
  nameUr: z.string().trim().optional(),
  gridCols: z.coerce.number().int().min(4, 'At least 4 columns.').max(200, 'At most 200 columns.'),
  gridRows: z.coerce.number().int().min(4, 'At least 4 rows.').max(200, 'At most 200 rows.'),
});

/**
 * Create a zone. §9.4's editor needs somewhere for a table to live before it
 * needs anything else, so this is the minimal "Add zone" the runfile asks
 * for — name and grid size. `isActive` defaults true and background upload is
 * `requestZoneBackgroundUploadAction` below, once the zone exists to attach a
 * key to.
 */
export async function createZoneAction(
  _previous: FloorFormState,
  form: FormData,
): Promise<FloorFormState> {
  const operator = await requireOperator();
  assertPermission(operator, FLOOR_WRITE);

  const parsed = CreateZoneInput.safeParse({
    name: form.get('name'),
    nameUr: form.get('nameUr') === '' ? undefined : form.get('nameUr'),
    gridCols: form.get('gridCols'),
    gridRows: form.get('gridRows'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form.', message: null };
  }

  const db = dbWrite();
  const context = await requestContext();

  try {
    await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(zones)
        .values({
          name: parsed.data.name,
          nameUr: parsed.data.nameUr ?? null,
          gridCols: parsed.data.gridCols,
          gridRows: parsed.data.gridRows,
        })
        .returning({ id: zones.id });
      const created = inserted[0];
      if (created === undefined) throw new Error('Inserting the zone returned no row.');

      await writeAudit(
        tx,
        { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
        {
          entity: 'zones',
          entityId: created.id,
          action: 'ZONE_CREATED',
          after: {
            name: parsed.data.name,
            gridCols: parsed.data.gridCols,
            gridRows: parsed.data.gridRows,
          },
        },
      );
    });
  } catch (error) {
    return { error: friendlyConstraintError(error) ?? 'Creating the zone failed.', message: null };
  }

  revalidatePath('/admin/floor');
  return { error: null, message: `${parsed.data.name} created.` };
}

/* ------------------------------------------------- zone background upload */

export interface ZoneBackgroundUploadState {
  readonly error: string | null;
  readonly upload: null;
}

/**
 * Mint a presigned PUT for a zone's background trace image — docs/runfiles's
 * §3 decision: the browser PUTs straight to R2,
 * and only the returned `key` is ever written to `zones.background_image_key`.
 * The app never sees the bytes.
 */
export async function requestZoneBackgroundUploadAction(
  _contentType: string,
): Promise<ZoneBackgroundUploadState> {
  const operator = await requireOperator();
  assertPermission(operator, FLOOR_WRITE);

  return { error: 'Background image uploads are disabled.', upload: null };
}

const SetZoneBackgroundInput = z.object({
  zoneId: z.uuid(),
  key: z.string().trim().min(1),
});

/** Persist the key a completed browser-to-R2 upload returned. Never a URL — see `resolveAssetUrl`. */
export async function setZoneBackgroundAction(
  zoneId: string,
  key: string,
): Promise<FloorFormState> {
  const operator = await requireOperator();
  assertPermission(operator, FLOOR_WRITE);

  const parsed = SetZoneBackgroundInput.safeParse({ zoneId, key });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the upload.', message: null };
  }

  const db = dbWrite();
  const context = await requestContext();

  const before = await db
    .select({ backgroundImageKey: zones.backgroundImageKey })
    .from(zones)
    .where(and(eq(zones.id, parsed.data.zoneId), isNull(zones.deletedAt)));
  if (before[0] === undefined) return { error: 'That zone no longer exists.', message: null };

  await db.transaction(async (tx) => {
    await tx
      .update(zones)
      .set({ backgroundImageKey: parsed.data.key, updatedAt: new Date() })
      .where(eq(zones.id, parsed.data.zoneId));

    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'zones',
        entityId: parsed.data.zoneId,
        action: 'ZONE_BACKGROUND_SET',
        before: before[0],
        after: { backgroundImageKey: parsed.data.key },
      },
    );
  });

  revalidatePath('/admin/floor');
  return { error: null, message: 'Background image saved.' };
}

/* ---------------------------------------------------------- layout save */

const TableGeometryInput = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  rotation: z.number().int().min(0).max(315),
});

const TableEditInput = z.object({
  /**
   * Generated client-side (`crypto.randomUUID()`) for a table the operator
   * just added, so it is also this table's final id — the save writes it as
   * the primary key on insert, and no client/server id remapping is needed.
   */
  id: z.uuid(),
  zoneId: z.uuid(),
  code: z.string().trim().min(1, 'Every table needs a code.'),
  minSeats: z.number().int().nonnegative(),
  maxSeats: z.number().int().positive(),
  shape: TableShapeSchema,
  geometry: TableGeometryInput,
});
export type TableEdit = z.infer<typeof TableEditInput>;

const SaveFloorLayoutInput = z.object({
  /** Only the tables actually touched since the last save — new, moved, resized, or re-attributed. */
  tables: z.array(TableEditInput),
  /** Previously-persisted tables the operator removed. Soft-deleted, never dropped (R6). */
  removedIds: z.array(z.uuid()),
});
export type SaveFloorLayoutInput = z.infer<typeof SaveFloorLayoutInput>;

/**
 * Persist one editing session's worth of table changes in a single
 * transaction, with one audit row summarising the whole batch (R7) — not one
 * row per table, which the M08 runfile calls out explicitly for the layout
 * save, the same way it calls out a single re-sequence write for drag-reorder.
 *
 * `FloorEditor` holds every table it has loaded in client state and only
 * calls this with the ones the operator actually touched, keyed by the
 * client-generated id described on `TableEditInput`. A row whose id is
 * already in `tables` is an update; one that is not is an insert — expressed
 * as a single upsert per table rather than a existence check plus a branch,
 * which also means two concurrent saves race safely on the same primary key.
 */
export async function saveFloorLayoutAction(input: SaveFloorLayoutInput): Promise<FloorFormState> {
  const operator = await requireOperator();
  assertPermission(operator, FLOOR_WRITE);

  const parsed = SaveFloorLayoutInput.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the layout.', message: null };
  }
  const { tables: edits, removedIds } = parsed.data;
  if (edits.length === 0 && removedIds.length === 0) return { error: null, message: null };

  for (const edit of edits) {
    if (edit.minSeats > edit.maxSeats) {
      return {
        error: `Table ${edit.code}: minimum seats cannot be more than maximum seats.`,
        message: null,
      };
    }
  }

  const db = dbWrite();
  const context = await requestContext();

  // §3 — "Floor geometry is trusted from the client only as data, not as
  // truth." Re-read the zones' CURRENT grid size and check every edited
  // table against it, rather than trusting the gridCols/gridRows this browser
  // loaded when the page first rendered.
  const zoneIds = [...new Set(edits.map((edit) => edit.zoneId))];
  const zoneRows: ZoneBoundsLike[] =
    zoneIds.length === 0
      ? []
      : await db
          .select({ id: zones.id, gridCols: zones.gridCols, gridRows: zones.gridRows })
          .from(zones)
          .where(and(inArray(zones.id, zoneIds), isNull(zones.deletedAt)));
  const zonesById = new Map(zoneRows.map((zone) => [zone.id, zone]));

  const violation = findBoundsViolation(edits, zonesById);
  if (violation !== null) {
    return {
      error: `Table ${violation.code} ${violation.reason}. Nothing was saved — fix it and save again.`,
      message: null,
    };
  }

  try {
    await db.transaction(async (tx) => {
      if (removedIds.length > 0) {
        // R6 — soft delete only. A table referenced by a past `table_sessions`
        // row (§5.5) must never be hard-deleted; `deleted_at` is enough to
        // drop it off the plan and out of `tables_zone_code_idx`'s partial
        // index, freeing its code for reuse.
        await tx
          .update(tables)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(and(inArray(tables.id, removedIds), isNull(tables.deletedAt)));
      }

      for (const edit of edits) {
        await tx
          .insert(tables)
          .values({
            id: edit.id,
            zoneId: edit.zoneId,
            code: edit.code,
            minSeats: edit.minSeats,
            maxSeats: edit.maxSeats,
            shape: edit.shape,
            x: edit.geometry.x,
            y: edit.geometry.y,
            width: edit.geometry.width,
            height: edit.geometry.height,
            rotation: edit.geometry.rotation,
          })
          .onConflictDoUpdate({
            target: tables.id,
            set: {
              zoneId: edit.zoneId,
              code: edit.code,
              minSeats: edit.minSeats,
              maxSeats: edit.maxSeats,
              shape: edit.shape,
              x: edit.geometry.x,
              y: edit.geometry.y,
              width: edit.geometry.width,
              height: edit.geometry.height,
              rotation: edit.geometry.rotation,
              updatedAt: new Date(),
              // `status`, `statusChangedAt`, `mergedIntoId` are §9.3 live-floor
              // state (M09b) and are deliberately absent from this `set` — the
              // editor never learns them and must not overwrite them.
            },
          });
      }

      await writeAudit(
        tx,
        { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
        {
          entity: 'tables',
          action: 'FLOOR_LAYOUT_SAVED',
          after: {
            updated: edits.map((edit) => edit.code),
            removed: removedIds.length,
          },
        },
      );
    });
  } catch (error) {
    return {
      error: friendlyConstraintError(error) ?? 'Saving the layout failed. Nothing was changed.',
      message: null,
    };
  }

  revalidatePath('/admin/floor');
  return { error: null, message: 'Layout saved.' };
}

/* ========================================================== live floor (M09b) */

/**
 * Live service-mode floor writes — BUILD-PLAN.md §9.1, §9.3;
 * docs/runfiles/M09b-floor-live.md §3.
 *
 * These six run at the till during service, not from the back office, so they
 * check `requireTillStaff()` — §14.2's "who is at the till right now" — and
 * `table.manage`, not `requireOperator()`'s back-office identity the
 * editor functions above use. Every one locks its table row(s) with
 * `for('update')`, transitions inside a transaction ending in `writeAudit`
 * (R7), and — after the transaction commits, never from inside it, same
 * reasoning as `placeOrderAction`'s own emit — wakes every open floor/tray
 * panel on the single fixed `FLOOR_CHANNEL` (§3).
 */

const NOT_OPEN_ORDER_STATUSES = ['FINALIZED', 'VOIDED'] as const;

/** §9.3's "occupied" vocabulary — mirrors `summariseFloor`'s own list (`packages/contracts/src/floor.ts`). */
const OCCUPIED_STATUSES: readonly TableStatus[] = ['SEATED', 'ORDERED', 'SERVED', 'PAYING'];

/** `TableContextSheet`'s own `TRANSFER` eligibility (§9.3) — mirrored here so the server enforces it too, not only the client. */
const TRANSFERABLE_STATUSES: readonly TableStatus[] = ['SEATED', 'ORDERED', 'SERVED'];

export interface LiveFloorResult {
  readonly ok: boolean;
  readonly error: string | null;
}

async function requireFloorManager(): Promise<TillIdentity> {
  const identity = await requireTillStaff();
  assertPermission(identity.viewer, 'table.manage');
  return identity;
}

function friendlyLiveFloorError(error: unknown): string {
  if (error instanceof Locked || error instanceof NotSignedIn || error instanceof Forbidden) {
    return error.message;
  }
  if (error instanceof IllegalTransitionError) return error.message;
  return error instanceof Error ? error.message : 'That did not work. Try again.';
}

async function notifyFloorChanged(): Promise<void> {
  await getRealtime().channel(FLOOR_CHANNEL).emit('floor.changed', {});
  revalidatePath('/floor');
  revalidatePath('/orders');
  revalidatePath('/');
}

/* ------------------------------------------------------------- seat guests */

const SeatGuestsInput = z.object({
  tableId: z.uuid(),
  guestCount: z.int().positive(),
});

/** `SEAT_GUESTS` — `FREE`/`RESERVED → SEATED`, opening a real `table_sessions` row. */
export async function seatGuestsAction(
  tableId: string,
  guestCount: number,
): Promise<LiveFloorResult> {
  const parsed = SeatGuestsInput.safeParse({ tableId, guestCount });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the guest count.' };
  }

  let identity: TillIdentity;
  try {
    identity = await requireFloorManager();
  } catch (error) {
    return { ok: false, error: friendlyLiveFloorError(error) };
  }
  const { viewer } = identity;
  const db = dbWrite();
  const context = await requestContext();

  try {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: tables.id, status: tables.status })
        .from(tables)
        .where(and(eq(tables.id, parsed.data.tableId), isNull(tables.deletedAt)))
        .for('update');
      const table = rows[0];
      if (table === undefined) throw new Error('That table no longer exists.');

      const from = table.status;
      tableMachine.assert(from, 'SEATED');

      await tx.insert(tableSessions).values({
        tableId: parsed.data.tableId,
        guestCount: parsed.data.guestCount,
        waiterId: viewer.id,
        seatedBy: viewer.id,
      });

      await tx
        .update(tables)
        .set({ status: 'SEATED', statusChangedAt: new Date(), updatedAt: new Date() })
        .where(eq(tables.id, parsed.data.tableId));

      await writeAudit(
        tx,
        { actorId: viewer.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
        {
          entity: 'tables',
          entityId: parsed.data.tableId,
          action: 'TABLE_SEATED',
          before: { status: from },
          after: { status: 'SEATED', guestCount: parsed.data.guestCount },
        },
      );
    });
  } catch (error) {
    return { ok: false, error: friendlyLiveFloorError(error) };
  }

  await notifyFloorChanged();
  return { ok: true, error: null };
}

/* ------------------------------------------------------------- mark clean */

const TableIdInput = z.object({ tableId: z.uuid() });

/** `MARK_CLEAN` — `CLEANING → FREE`. Unreachable in real data until M10's finalize puts a table into `CLEANING`. */
export async function markCleanAction(tableId: string): Promise<LiveFloorResult> {
  const parsed = TableIdInput.safeParse({ tableId });
  if (!parsed.success) return { ok: false, error: 'That is not a valid table.' };

  let identity: TillIdentity;
  try {
    identity = await requireFloorManager();
  } catch (error) {
    return { ok: false, error: friendlyLiveFloorError(error) };
  }
  const { viewer } = identity;
  const db = dbWrite();
  const context = await requestContext();

  try {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: tables.id, status: tables.status })
        .from(tables)
        .where(and(eq(tables.id, parsed.data.tableId), isNull(tables.deletedAt)))
        .for('update');
      const table = rows[0];
      if (table === undefined) throw new Error('That table no longer exists.');

      tableMachine.assert(table.status, 'FREE');

      await tx
        .update(tables)
        .set({ status: 'FREE', statusChangedAt: new Date(), updatedAt: new Date() })
        .where(eq(tables.id, parsed.data.tableId));

      await writeAudit(
        tx,
        { actorId: viewer.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
        {
          entity: 'tables',
          entityId: parsed.data.tableId,
          action: 'TABLE_MARKED_CLEAN',
          before: { status: table.status },
          after: { status: 'FREE' },
        },
      );
    });
  } catch (error) {
    return { ok: false, error: friendlyLiveFloorError(error) };
  }

  await notifyFloorChanged();
  return { ok: true, error: null };
}

/* ------------------------------------------------------------- block/unblock */

/** `BLOCK` — toggles `* → BLOCKED` (out of service) and `BLOCKED → FREE` (return to service). */
export async function toggleBlockAction(tableId: string): Promise<LiveFloorResult> {
  const parsed = TableIdInput.safeParse({ tableId });
  if (!parsed.success) return { ok: false, error: 'That is not a valid table.' };

  let identity: TillIdentity;
  try {
    identity = await requireFloorManager();
  } catch (error) {
    return { ok: false, error: friendlyLiveFloorError(error) };
  }
  const { viewer } = identity;
  const db = dbWrite();
  const context = await requestContext();

  try {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: tables.id, status: tables.status })
        .from(tables)
        .where(and(eq(tables.id, parsed.data.tableId), isNull(tables.deletedAt)))
        .for('update');
      const table = rows[0];
      if (table === undefined) throw new Error('That table no longer exists.');

      const to: TableStatus = table.status === 'BLOCKED' ? 'FREE' : 'BLOCKED';
      tableMachine.assert(table.status, to);

      await tx
        .update(tables)
        .set({ status: to, statusChangedAt: new Date(), updatedAt: new Date() })
        .where(eq(tables.id, parsed.data.tableId));

      await writeAudit(
        tx,
        { actorId: viewer.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
        {
          entity: 'tables',
          entityId: parsed.data.tableId,
          action: to === 'BLOCKED' ? 'TABLE_BLOCKED' : 'TABLE_UNBLOCKED',
          before: { status: table.status },
          after: { status: to },
        },
      );
    });
  } catch (error) {
    return { ok: false, error: friendlyLiveFloorError(error) };
  }

  await notifyFloorChanged();
  return { ok: true, error: null };
}

/* ------------------------------------------------------------------ transfer */

const TransferInput = z.object({ sourceTableId: z.uuid(), destinationTableId: z.uuid() });

/**
 * `TRANSFER` — moves a table's open session and every one of its open orders
 * onto a `FREE` destination. Not modelled as a `tableMachine` edge (§3's
 * decision): the destination's resulting status is not a function of its own
 * prior status the way every machine-governed edge is, and an occupied
 * table's own move to `FREE` (`ORDERED`/`SERVED` have no such edge — a table
 * only reaches `FREE` by finishing service) is exactly the jump the machine
 * exists to refuse for every *other* caller.
 */
export async function transferTableAction(
  sourceTableId: string,
  destinationTableId: string,
): Promise<LiveFloorResult> {
  const parsed = TransferInput.safeParse({ sourceTableId, destinationTableId });
  if (!parsed.success) return { ok: false, error: 'Choose a table to transfer to.' };
  if (parsed.data.sourceTableId === parsed.data.destinationTableId) {
    return { ok: false, error: 'Choose a different table.' };
  }

  let identity: TillIdentity;
  try {
    identity = await requireFloorManager();
  } catch (error) {
    return { ok: false, error: friendlyLiveFloorError(error) };
  }
  const { viewer } = identity;
  const db = dbWrite();
  const context = await requestContext();

  try {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: tables.id, status: tables.status, mergedIntoId: tables.mergedIntoId })
        .from(tables)
        .where(
          and(
            inArray(tables.id, [parsed.data.sourceTableId, parsed.data.destinationTableId]),
            isNull(tables.deletedAt),
          ),
        )
        .for('update');
      const source = rows.find((row) => row.id === parsed.data.sourceTableId);
      const destination = rows.find((row) => row.id === parsed.data.destinationTableId);
      if (source === undefined || destination === undefined) {
        throw new Error('One of those tables no longer exists.');
      }
      if (source.mergedIntoId !== null) {
        throw new Error('A merged table transfers through its primary table.');
      }
      // Mirrors `TableContextSheet`'s own `TRANSFER` eligibility (§9.3) — not
      // only client-side filtering (R4): `CLEANING`/`BLOCKED`/`FREE` tables
      // have nothing a transfer moves.
      if (!TRANSFERABLE_STATUSES.includes(source.status)) {
        throw new Error('Nothing to transfer — that table has no open session.');
      }
      if (destination.status !== 'FREE' || destination.mergedIntoId !== null) {
        throw new Error('The destination table must be free and not part of a merge.');
      }

      const openSessionRows = await tx
        .select({ id: tableSessions.id })
        .from(tableSessions)
        .where(and(eq(tableSessions.tableId, source.id), isNull(tableSessions.closedAt)))
        .for('update');
      const openSession = openSessionRows[0];
      if (openSession !== undefined) {
        await tx
          .update(tableSessions)
          .set({ tableId: destination.id, updatedAt: new Date() })
          .where(eq(tableSessions.id, openSession.id));
      }

      await tx
        .update(orders)
        .set({ tableId: destination.id, updatedAt: new Date() })
        .where(
          and(
            eq(orders.tableId, source.id),
            notInArray(orders.status, [...NOT_OPEN_ORDER_STATUSES]),
          ),
        );

      await tx
        .update(tables)
        .set({ status: source.status, statusChangedAt: new Date(), updatedAt: new Date() })
        .where(eq(tables.id, destination.id));
      await tx
        .update(tables)
        .set({ status: 'FREE', statusChangedAt: new Date(), updatedAt: new Date() })
        .where(eq(tables.id, source.id));

      await writeAudit(
        tx,
        { actorId: viewer.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
        {
          entity: 'tables',
          entityId: destination.id,
          action: 'TABLE_TRANSFERRED',
          before: { fromTableId: source.id, status: source.status },
          after: { toTableId: destination.id },
        },
      );
    });
  } catch (error) {
    return { ok: false, error: friendlyLiveFloorError(error) };
  }

  await notifyFloorChanged();
  return { ok: true, error: null };
}

/* --------------------------------------------------------------------- merge */

const MergeInput = z.object({ tableIdA: z.uuid(), tableIdB: z.uuid() });

/**
 * `MERGE` — absorbs a `FREE` table into an occupied one (docs/runfiles's own
 * §3 decision narrows this to exactly that case). Whichever of the two the
 * operator tapped, the server decides which side is which: the `FREE` one
 * becomes the secondary, `merged_into_id` pointed at the other, its status
 * mirrored from it. Refuses if neither or both sides are `FREE`, or if either
 * is already part of a merge.
 */
export async function mergeTablesAction(
  tableIdA: string,
  tableIdB: string,
): Promise<LiveFloorResult> {
  const parsed = MergeInput.safeParse({ tableIdA, tableIdB });
  if (!parsed.success) return { ok: false, error: 'Choose a table to merge with.' };
  if (parsed.data.tableIdA === parsed.data.tableIdB) {
    return { ok: false, error: 'Choose a different table.' };
  }

  let identity: TillIdentity;
  try {
    identity = await requireFloorManager();
  } catch (error) {
    return { ok: false, error: friendlyLiveFloorError(error) };
  }
  const { viewer } = identity;
  const db = dbWrite();
  const context = await requestContext();

  try {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: tables.id, status: tables.status, mergedIntoId: tables.mergedIntoId })
        .from(tables)
        .where(
          and(
            inArray(tables.id, [parsed.data.tableIdA, parsed.data.tableIdB]),
            isNull(tables.deletedAt),
          ),
        )
        .for('update');
      const a = rows.find((row) => row.id === parsed.data.tableIdA);
      const b = rows.find((row) => row.id === parsed.data.tableIdB);
      if (a === undefined || b === undefined)
        throw new Error('One of those tables no longer exists.');
      if (a.mergedIntoId !== null || b.mergedIntoId !== null) {
        throw new Error('One of those tables is already part of a merge.');
      }

      const freeSide = a.status === 'FREE' ? a : b.status === 'FREE' ? b : null;
      const occupiedSide = freeSide === a ? b : a;
      if (freeSide === null || !OCCUPIED_STATUSES.includes(occupiedSide.status)) {
        throw new Error(
          'Merge only combines a free table into an occupied one — transfer or split first.',
        );
      }

      await tx
        .update(tables)
        .set({
          mergedIntoId: occupiedSide.id,
          status: occupiedSide.status,
          statusChangedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tables.id, freeSide.id));

      await writeAudit(
        tx,
        { actorId: viewer.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
        {
          entity: 'tables',
          entityId: occupiedSide.id,
          action: 'TABLES_MERGED',
          after: { primaryTableId: occupiedSide.id, secondaryTableId: freeSide.id },
        },
      );
    });
  } catch (error) {
    return { ok: false, error: friendlyLiveFloorError(error) };
  }

  await notifyFloorChanged();
  return { ok: true, error: null };
}

/* --------------------------------------------------------------------- split */

/** `SPLIT` — the exact reverse of a merge: clears `merged_into_id`, back to `FREE`. Never reassigns order lines (§3). */
export async function splitTableAction(tableId: string): Promise<LiveFloorResult> {
  const parsed = TableIdInput.safeParse({ tableId });
  if (!parsed.success) return { ok: false, error: 'That is not a valid table.' };

  let identity: TillIdentity;
  try {
    identity = await requireFloorManager();
  } catch (error) {
    return { ok: false, error: friendlyLiveFloorError(error) };
  }
  const { viewer } = identity;
  const db = dbWrite();
  const context = await requestContext();

  try {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: tables.id, mergedIntoId: tables.mergedIntoId })
        .from(tables)
        .where(and(eq(tables.id, parsed.data.tableId), isNull(tables.deletedAt)))
        .for('update');
      const table = rows[0];
      if (table === undefined) throw new Error('That table no longer exists.');
      if (table.mergedIntoId === null) throw new Error('That table is not part of a merge.');

      await tx
        .update(tables)
        .set({
          mergedIntoId: null,
          status: 'FREE',
          statusChangedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tables.id, parsed.data.tableId));

      await writeAudit(
        tx,
        { actorId: viewer.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
        {
          entity: 'tables',
          entityId: parsed.data.tableId,
          action: 'TABLE_SPLIT',
          before: { mergedIntoId: table.mergedIntoId },
          after: { status: 'FREE' },
        },
      );
    });
  } catch (error) {
    return { ok: false, error: friendlyLiveFloorError(error) };
  }

  await notifyFloorChanged();
  return { ok: true, error: null };
}
