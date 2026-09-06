'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { and, asc, eq, gte, inArray, isNull, ne, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  customers,
  dbRead,
  dbWrite,
  nextOrderNoFrom,
  orderLineModifiers,
  orderLines,
  orders,
  readMaxOrderNo,
  tableSessions,
  tables,
  withOrderNoRetry,
  writeAudit,
} from '@natech/db';
import { IllegalTransitionError, orderMachine, qtyToString, tableMachine } from '@natech/domain';
import type { TableStatus } from '@natech/domain';
import { OrderTypeSchema, PaisaSchema, QtySchema, TaxClassKeySchema } from '@natech/contracts';
import type { Order, TaxClassKey, TrayOrder } from '@natech/contracts';
import {
  Forbidden,
  Locked,
  NotSignedIn,
  assertPermission,
  requestContext,
  requireTillStaff,
} from '../auth/session';
import type { TillIdentity } from '../auth/session';
import { computeBusinessDate } from './businessDate';
import { loadPriceableOrder } from './pricing';
import { loadOrdersQueue } from './queries';
import { currentOrderStatus, type PersistedOrderStatus } from './status';

/**
 * The order lifecycle's one real mutation — BUILD-PLAN.md §5.6, §6.2, §2
 * R2/R4/R6/R7; ADR 0018.
 *
 * `OrderScreen`'s cart is entirely client-side and stays that way — nothing
 * here runs until Print Receipt or Finalize needs a real order to act on
 * (`sendUnsentLines`, `OrderScreen.tsx` — placement is automatic now, not its
 * own button). This file is the server side of that one moment: create or
 * extend an `orders` row and snapshot every cart line onto `order_lines`
 * (§5.6 — name, price, and the three fiscal codes, so a later menu edit
 * cannot move a number a guest has already been shown).
 *
 * ADR 0018 removed the kitchen display product this action used to fire
 * tickets to — no station routing, no per-line kitchen status, no realtime
 * event per station. What is left is the plain "commit these cart lines to
 * the order" mutation the name now describes.
 *
 * Every mutation here follows `lib/floor/actions.ts`'s established shape:
 * Zod input, `requireTillStaff()` (§14.2 — the person AT THE TILL placing the
 * order, not `requireOperator()`'s back-office identity) then
 * `assertPermission`, `dbWrite()`, one transaction per action ending in
 * `writeAudit`, and `dbWrite`/`tx` for every read (R2) — never `dbRead`, even
 * though this file does not sit inside a directory literally named `actions/`
 * and so is not textually caught by the `r2-no-dbread-in-mutations` ESLint
 * rule; the discipline is followed anyway, the same way `floor/actions.ts`
 * already does.
 *
 * **Second-round sends.** A table that orders mains, sends, and orders
 * dessert later reuses the same `orders` row (`existingOrderId`) rather than
 * creating a second order — the realistic case a real service asks for. What
 * it cannot do is add lines once the order has moved past `PLACED` (a check
 * printed, the food served, the sale finalized): R4 means refusing that case
 * with a clear message, not routing around it. A table that wants to add
 * items after that point needs a new order.
 */

const DEFAULT_TAX_CLASS_KEY: TaxClassKey = 'STANDARD_FOOD'; // mirrors lib/menu/queries.ts's fallback

/** A controlled early exit distinct from `IllegalTransitionError` — a refusal with nothing left to try, not a machine violation. */
class OrderActionRefusal extends Error {}

/* ------------------------------------------------------------ place order */

const PlaceOrderModifierInput = z.object({
  modifierId: z.uuid().nullable(),
  nameSnapshot: z.string().min(1),
  nameUrSnapshot: z.string().nullable(),
  priceDelta: PaisaSchema,
});

const PlaceOrderLineInput = z.object({
  /** The client's cart-line key, echoed back so the UI can mark exactly these lines sent. */
  cartKey: z.string().min(1),
  menuItemId: z.uuid(),
  variantId: z.uuid().nullable(),
  nameSnapshot: z.string().min(1),
  nameUrSnapshot: z.string().nullable(),
  variantLabel: z.string().nullable(),
  qty: QtySchema,
  unitPrice: PaisaSchema,
  taxClass: TaxClassKeySchema,
  seatNo: z.int().positive().nullable(),
  note: z.string().trim().min(1).nullable(),
  modifiers: z.array(PlaceOrderModifierInput),
});

const PlaceOrderInputSchema = z
  .object({
    clientOrderUuid: z.uuid(),
    /** Null on the first send for this table/session; the order id on every round after. */
    existingOrderId: z.uuid().nullable(),
    tableId: z.uuid().nullable(),
    guestCount: z.int().nonnegative().nullable(),
    orderType: OrderTypeSchema,
    deliveryAddress: z.string().trim().max(1000).nullable().optional(),
    deliveryCharge: PaisaSchema.refine((v) => v >= 0n && v <= 100000000n).optional(),
    serviceChargeBpsOverride: z.int().min(0).max(10_000).nullable(),
    note: z.string().trim().min(1).nullable(),
    lines: z.array(PlaceOrderLineInput).min(1, 'Nothing to send.'),
  })
  .refine((data) => data.orderType !== 'DELIVERY' || !!data.deliveryAddress?.trim(), {
    message: 'Enter a delivery address.',
    path: ['deliveryAddress'],
  });
/**
 * `z.input`, not `z.infer`/`z.output` — `qty` and every `Paisa` field carry a
 * `.transform()` (`QtySchema`/`PaisaSchema`, `@natech/contracts`), so the
 * output type (what `z.infer` would give) is the already-parsed `Qty`/`Paisa`
 * bigint the *server* ends up with, not the decimal-string wire shape the
 * *caller* (`OrderScreen`) actually sends across the server-action boundary
 * (`toQtyWire`/`toPaisaWire` — money.ts's own doc comment explains why a
 * string, never a bigint, crosses that boundary).
 */
export type PlaceOrderInput = z.input<typeof PlaceOrderInputSchema>;

export type PlaceOrderResult =
  | {
      readonly ok: true;
      readonly orderId: string;
      readonly orderNo: number;
      readonly tableId: string | null;
      readonly sentAt: string;
      /** Every `cartKey` this call actually persisted — what the client marks `sentAt` on. */
      readonly sentCartKeys: readonly string[];
    }
  | { readonly ok: false; readonly error: string };

export async function placeOrderAction(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const parsed = PlaceOrderInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the order.' };
  }
  const data = parsed.data;

  let identity: TillIdentity;
  try {
    identity = await requireTillStaff();
  } catch (error) {
    if (error instanceof Locked || error instanceof NotSignedIn) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
  const { viewer, binding } = identity;

  try {
    assertPermission(viewer, 'order.send');
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: error.message };
    throw error;
  }

  const db = dbWrite();
  const context = await requestContext();

  const attempt = (): Promise<PlaceOrderResult> =>
    db.transaction(async (tx) => {
      // One database statement replaces four sequential transaction reads:
      // shift lock, idempotency replay, tax-class map, and business-day
      // settings. With a remote Neon database this removes three full
      // network round trips from every booking.
      const bootstrap = await tx.execute<{
        open_shift_id: string | null;
        replay: {
          id: string;
          order_no: number;
          table_id: string | null;
          created_at: string;
        } | null;
        tax_classes: Array<{ id: string; key: string }>;
        timezone: string | null;
        cutoff: string | null;
      }>(sql`
        with open_shift as (
          select id from shifts where status = 'OPEN' limit 1 for key share
        )
        select
          (select id from open_shift) as open_shift_id,
          case when ${data.existingOrderId === null} then (
            select row_to_json(r) from (
              select id, order_no, table_id, created_at
              from orders
              where client_order_uuid = ${data.clientOrderUuid} and deleted_at is null
              limit 1
            ) r
          ) else null end as replay,
          coalesce((
            select json_agg(json_build_object('id', id, 'key', key))
            from tax_classes where deleted_at is null
          ), '[]'::json) as tax_classes,
          (select timezone from outlet_config where singleton = true) as timezone,
          (select business_day_cutoff::text from outlet_config where singleton = true) as cutoff
      `);
      const bootstrapRow = bootstrap.rows[0];
      if (bootstrapRow?.open_shift_id === null || bootstrapRow === undefined) {
        throw new OrderActionRefusal('The register is closed. Open a shift before sending orders.');
      }
      const freshBusinessDate =
        data.existingOrderId === null &&
        bootstrapRow.timezone !== null &&
        bootstrapRow.cutoff !== null
          ? computeBusinessDate(new Date(), {
              timezone: bootstrapRow.timezone,
              cutoff: bootstrapRow.cutoff,
            })
          : null;

      // `orders_client_uuid_idx` (packages/db/src/schema.ts) is this file's
      // own documented "§8 idempotency guarantee on orders.client_order_uuid"
      // — enforced here, not just declared. A fresh-order request (no
      // `existingOrderId`) whose `clientOrderUuid` already has a row means
      // this exact booking already committed on an earlier attempt and the
      // caller never saw the response (the DB write can commit and the
      // client's `await` still fail to observe it — a dropped connection, a
      // client crash between commit and response). Replaying it has to
      // return the original booking, not throw into the unique index below
      // or silently create a second order for the same cart.
      if (data.existingOrderId === null) {
        const existing = bootstrapRow.replay;
        if (existing !== null) {
          return {
            ok: true,
            orderId: existing.id,
            orderNo: existing.order_no,
            tableId: existing.table_id,
            sentAt: new Date(existing.created_at).toISOString(),
            sentCartKeys: data.lines.map((line) => line.cartKey),
          };
        }
      }

      const taxClassIdByKey = new Map(bootstrapRow.tax_classes.map((row) => [row.key, row.id]));
      const defaultTaxClassId = taxClassIdByKey.get(DEFAULT_TAX_CLASS_KEY) ?? null;

      const sentAt = new Date();
      const existingTableId =
        data.existingOrderId === null
          ? null
          : await tx
              .select({ tableId: orders.tableId })
              .from(orders)
              .where(and(eq(orders.id, data.existingOrderId), isNull(orders.deletedAt)))
              .then((rows) => rows[0]?.tableId ?? null);

      // A dine-in order without a table is not a valid running order. Choose
      // the smallest free table that fits the party, locking it so two tills
      // cannot auto-assign the same table concurrently. Non-dine-in orders
      // never retain a table even if a stale client sends one.
      let resolvedTableId = data.orderType === 'DINE_IN' ? data.tableId : null;
      if (data.orderType === 'DINE_IN' && resolvedTableId === null) {
        const candidates = await tx
          .select({ id: tables.id })
          .from(tables)
          .where(
            and(
              isNull(tables.deletedAt),
              eq(tables.status, 'FREE'),
              gte(tables.maxSeats, Math.max(1, data.guestCount ?? 1)),
            ),
          )
          .orderBy(asc(tables.maxSeats), asc(tables.code))
          .limit(1)
          .for('update', { skipLocked: true });
        resolvedTableId = candidates[0]?.id ?? null;
        if (resolvedTableId === null) {
          throw new OrderActionRefusal('No free table is available for this dine-in order.');
        }
      }

      // docs/runfiles/M09b-floor-live.md §3 — `SEATED → ORDERED` fires here,
      // the moment this call already knows the answer, rather than as a
      // separate poller. `tableMachine.can` (not `.assert`) because a table
      // arriving here in some other state (already `ORDERED`, or a genuinely
      // unexpected one) must not fail an order that is otherwise fine to
      // place — table-status sync is best-effort against the order it is
      // meant to reflect, not the other way round. `tableSessionId` is
      // resolved the same lookup: the currently open `table_sessions` row for
      // this table, if any, snapshotted onto the order the way §5.6 asks.
      let tableSessionId: string | null = null;
      if (resolvedTableId !== null) {
        const tableRows = await tx
          .select({ id: tables.id, status: tables.status })
          .from(tables)
          .where(eq(tables.id, resolvedTableId))
          .for('update');
        const table = tableRows[0];

        if (table === undefined) throw new OrderActionRefusal('That table no longer exists.');
        if (
          resolvedTableId !== existingTableId &&
          table.status !== 'FREE' &&
          table.status !== 'RESERVED'
        ) {
          throw new OrderActionRefusal('Choose a free or reserved table.');
        }
        {
          const conflictingOrders = await tx
            .select({ id: orders.id })
            .from(orders)
            .where(
              and(
                eq(orders.tableId, resolvedTableId),
                isNull(orders.deletedAt),
                notInArray(orders.status, ['FINALIZED', 'VOIDED']),
                data.existingOrderId === null ? undefined : ne(orders.id, data.existingOrderId),
              ),
            )
            .limit(1);
          if (conflictingOrders.length > 0) {
            throw new OrderActionRefusal('That table already has a running order.');
          }

          const sessionRows = await tx
            .select({ id: tableSessions.id })
            .from(tableSessions)
            .where(and(eq(tableSessions.tableId, resolvedTableId), isNull(tableSessions.closedAt)));
          tableSessionId = sessionRows[0]?.id ?? null;

          if (tableSessionId === null) {
            const [session] = await tx
              .insert(tableSessions)
              .values({
                tableId: resolvedTableId,
                guestCount: data.guestCount ?? 0,
                waiterId: viewer.id,
                seatedBy: viewer.id,
              })
              .returning({ id: tableSessions.id });
            tableSessionId = session?.id ?? null;
          }

          if (table.status === 'FREE' || table.status === 'RESERVED' || table.status === 'SEATED') {
            await tx
              .update(tables)
              .set({ status: 'ORDERED', statusChangedAt: sentAt, updatedAt: sentAt })
              .where(eq(tables.id, resolvedTableId));

            await writeAudit(
              tx,
              { actorId: viewer.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
              {
                entity: 'tables',
                entityId: resolvedTableId,
                action: 'TABLE_ORDERED',
                before: { status: table.status },
                after: { status: 'ORDERED' },
              },
            );
          }
        }
      }

      let orderId: string;
      let orderNo: number;

      if (data.existingOrderId === null) {
        // A fresh order. There is no separate "create draft" step server-side
        // (the cart stays client-only until this call), so the machine is
        // exercised from a conceptual DRAFT starting point — R4 applies to a
        // brand-new row exactly as it does to an update.
        orderMachine.assert('DRAFT', 'PLACED');

        if (freshBusinessDate === null) throw new Error('Business date was not resolved.');
        const businessDate = freshBusinessDate;
        const maxNo = await readMaxOrderNo(tx, businessDate);
        const candidateNo = nextOrderNoFrom(maxNo);

        const inserted = await tx
          .insert(orders)
          .values({
            orderNo: candidateNo,
            channel: 'POS',
            type: data.orderType,
            tableId: resolvedTableId,
            tableSessionId,
            guestCount: data.guestCount,
            deliveryAddress: data.orderType === 'DELIVERY' ? data.deliveryAddress : null,
            deliveryCharge: data.orderType === 'DELIVERY' ? (data.deliveryCharge ?? 0n) : 0n,
            serviceChargeBpsOverride: data.serviceChargeBpsOverride,
            status: 'PLACED',
            note: data.note,
            clientOrderUuid: data.clientOrderUuid,
            businessDate,
            // §6.7 — the rate in force when service began. Nothing server-side
            // marks an earlier moment than this call, so the send instant is
            // the closest honest value available this milestone.
            serviceStartedAt: sentAt,
            waiterId: viewer.id,
            terminalId: binding.terminalId,
          })
          .returning({ id: orders.id });
        const created = inserted[0];
        if (created === undefined) throw new Error('Inserting the order returned no row.');
        orderId = created.id;
        orderNo = candidateNo;

        await writeAudit(
          tx,
          { actorId: viewer.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
          {
            entity: 'orders',
            entityId: orderId,
            action: 'ORDER_PLACED',
            after: { orderNo, status: 'PLACED', lineCount: data.lines.length },
          },
        );
      } else {
        const existingRows = await tx
          .select({
            id: orders.id,
            status: orders.status,
            type: orders.type,
            orderNo: orders.orderNo,
            tableId: orders.tableId,
          })
          .from(orders)
          .where(and(eq(orders.id, data.existingOrderId), isNull(orders.deletedAt)))
          .for('update');
        const existing = existingRows[0];
        if (existing === undefined) throw new OrderActionRefusal('That order no longer exists.');

        if (existing.type !== data.orderType)
          throw new OrderActionRefusal('Start a new order to change the order type.');
        orderId = existing.id;
        orderNo = existing.orderNo;
        const currentStatus = currentOrderStatus(existing.status as PersistedOrderStatus);

        // A second (or later) round can only add lines while the order is
        // still `PLACED` — once a check has printed, the food's been served,
        // or the sale finalized, this is a refusal (R4), not a route around it.
        if (currentStatus !== 'PLACED') {
          throw new OrderActionRefusal(
            `This order is already ${currentStatus} and cannot take more items.`,
          );
        }
        if (existing.tableId !== resolvedTableId) {
          throw new OrderActionRefusal('Change the table before saving this running order.');
        }

        await tx
          .update(orders)
          .set({
            tableId: resolvedTableId,
            tableSessionId,
            deliveryAddress: data.orderType === 'DELIVERY' ? data.deliveryAddress : null,
            deliveryCharge: data.orderType === 'DELIVERY' ? (data.deliveryCharge ?? 0n) : 0n,
            serviceChargeBpsOverride: data.serviceChargeBpsOverride,
            updatedAt: sentAt,
          })
          .where(eq(orders.id, orderId));

        await writeAudit(
          tx,
          { actorId: viewer.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
          {
            entity: 'orders',
            entityId: orderId,
            action: 'ORDER_PLACED',
            after: { orderNo, addedLines: data.lines.length },
          },
        );
      }

      const preparedLines = data.lines.map((line) => {
        const id = randomUUID();
        const taxClassId = taxClassIdByKey.get(line.taxClass) ?? defaultTaxClassId;
        return {
          id,
          cartKey: line.cartKey,
          values: {
            id,
            orderId,
            menuItemId: line.menuItemId,
            variantId: line.variantId,
            nameSnapshot: line.nameSnapshot,
            nameUrSnapshot: line.nameUrSnapshot,
            qty: qtyToString(line.qty),
            unitPrice: line.unitPrice,
            lineDiscount: 0n,
            taxClassId,
            seatNo: line.seatNo,
            note: line.note,
          },
          modifiers: line.modifiers.map((modifier) => ({
            orderLineId: id,
            modifierId: modifier.modifierId,
            nameSnapshot: modifier.nameSnapshot,
            nameUrSnapshot: modifier.nameUrSnapshot,
            priceDelta: modifier.priceDelta,
          })),
        };
      });

      // One insert per table, not one database round trip per cart line (and
      // another per line's modifiers). IDs are allocated here so modifiers
      // can reference their lines in the same two-statement batch.
      await tx.insert(orderLines).values(preparedLines.map((line) => line.values));
      const preparedModifiers = preparedLines.flatMap((line) => line.modifiers);
      if (preparedModifiers.length > 0) {
        await tx.insert(orderLineModifiers).values(preparedModifiers);
      }

      return {
        ok: true,
        orderId,
        orderNo,
        tableId: resolvedTableId,
        sentAt: sentAt.toISOString(),
        sentCartKeys: preparedLines.map((line) => line.cartKey),
      };
    });

  let result: PlaceOrderResult;
  try {
    result = await withOrderNoRetry(attempt);
  } catch (error) {
    if (error instanceof OrderActionRefusal) return { ok: false, error: error.message };
    if (error instanceof IllegalTransitionError) return { ok: false, error: error.message };
    // Anything else here is a genuine DB/transport fault, not a business
    // refusal — same posture as `lib/floor/actions.ts`'s own
    // `friendlyConstraintError` catch-all (CLAUDE.md "Traps found the hard
    // way": the real Postgres message naming the failing constraint is on
    // `error.cause`, not `error.message`, so it belongs in the server log,
    // not a cashier-facing toast). Left as a rethrow before this fix, an
    // unclassified failure here — a bad FK, a transient connection drop —
    // reached the client as an uncaught rejection: a raw driver dump in dev,
    // Next.js's generic production digest otherwise, and either way it used
    // to leave `takingOrder` stuck true with nothing to click. Returning a
    // plain refusal instead means the cashier gets an answer and the button
    // re-enables, in every environment, the same way every other failure in
    // this function already works.
    console.error('placeOrderAction: unhandled failure', error);
    return { ok: false, error: 'Placing the order failed. Try again.' };
  }

  // Emitted after the transaction commits, never from inside it — this is an
  // outbound HTTP call to Upstash, not part of the Postgres transaction, and
  // a floor/tray panel must not be told to refetch a mutation that then rolls
  // back.
  //
  // The order is already committed by this point, so nothing below may ever
  // stop this action from returning `result` to the cashier. `@upstash/redis`
  // retries a failing call up to 5 times with backoff before it gives up
  // (no caller-side timeout), which used to leave the client's own
  // `await placeOrderAction()` hanging or rejecting for a booking that had
  // already succeeded — the "Take Order gets stuck" defect this try/catch
  // closes. `# ponytail: swallow-and-log, not queued for retry — the floor
  // and tray already have their own 3-4s poll backstop and pick this up
  // regardless; upgrade to a queued retry if a dropped realtime nudge ever
  // actually costs someone a stale screen in practice.`
  if (result.ok) {
    // The floor/tray poll every few seconds, so cache invalidation is enough.
    // Do not call Upstash here: a token without XADD permission otherwise
    // waits through retries and can surface an error after a successful sale.
    after(() => {
      revalidatePath('/floor');
      revalidatePath('/orders');
    });
  }

  return result;
}

/* ------------------------------------------------------------ void order */

const VoidOrderInputSchema = z.object({
  orderId: z.uuid(),
});
const OPERATOR_VOID_REASON = 'Voided by operator';
export type VoidOrderInput = z.infer<typeof VoidOrderInputSchema>;

export interface VoidOrderResult {
  readonly ok: boolean;
  readonly error: string | null;
}

/**
 * Void an order — BUILD-PLAN.md §11.3, R4, R7;
 * docs/runfiles/M09b-floor-live.md §3.
 *
 * The signed-in till operator still needs the `order.void` permission, but
 * voiding requires only UI confirmation — no reason or supervisor/step-up
 * PIN. Every `order_lines` row is voided alongside the order, each carrying
 * the standard audit reason — `voidReason`
 * (not the removed `kitchenStatus`) is the one signal `lib/reports/sales.ts`
 * and every pricing read use to exclude a voided line.
 */
export async function voidOrderAction(input: VoidOrderInput): Promise<VoidOrderResult> {
  const parsed = VoidOrderInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the request.' };
  }

  let identity: TillIdentity;
  try {
    identity = await requireTillStaff();
  } catch (error) {
    if (error instanceof Locked || error instanceof NotSignedIn) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
  const { viewer } = identity;

  try {
    assertPermission(viewer, 'order.void');
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: error.message };
    throw error;
  }

  const context = await requestContext();

  const db = dbWrite();

  try {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: orders.id, status: orders.status, tableId: orders.tableId })
        .from(orders)
        .where(and(eq(orders.id, parsed.data.orderId), isNull(orders.deletedAt)));
      const existing = rows[0];
      if (existing === undefined) throw new OrderActionRefusal('That order no longer exists.');

      const persistedStatus = existing.status as PersistedOrderStatus;
      const fromStatus = currentOrderStatus(persistedStatus);
      // R5, expressed as a machine edge: FINALIZED has none, so a finalized
      // invoice's order cannot be voided from here — a credit note is the
      // only way back, and that is M11's territory, not this one's.
      orderMachine.assert(fromStatus, 'VOIDED');

      await tx
        .update(orders)
        .set({ status: 'VOIDED', updatedAt: new Date() })
        .where(eq(orders.id, parsed.data.orderId));

      await tx
        .update(orderLines)
        .set({ voidReason: OPERATOR_VOID_REASON, updatedAt: new Date() })
        .where(
          and(
            eq(orderLines.orderId, parsed.data.orderId),
            isNull(orderLines.deletedAt),
            isNull(orderLines.voidReason),
          ),
        );

      await writeAudit(
        tx,
        { actorId: viewer.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
        {
          entity: 'orders',
          entityId: parsed.data.orderId,
          action: 'ORDER_VOIDED',
          before: { status: persistedStatus },
          after: { status: 'VOIDED', reason: OPERATOR_VOID_REASON },
        },
      );

      // Free the table if this was its last open order — a table left in
      // ORDERED/SERVED/PAYING after its only order is voided otherwise keeps
      // offering Take Payment for an order that no longer exists, and the
      // floor plan reads as still occupied when it is not (2026-08-27; the
      // reported "Table 9 still shows Take Payment" symptom). Skipped
      // entirely when the table is BLOCKED, RESERVED, or already
      // FREE/CLEANING — those are states a manager set on purpose, not a
      // side effect of *this* order dying.
      if (existing.tableId !== null) {
        const stillOpen = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(
            and(
              eq(orders.tableId, existing.tableId),
              isNull(orders.deletedAt),
              notInArray(orders.status, ['FINALIZED', 'VOIDED']),
            ),
          )
          .limit(1);

        if (stillOpen.length === 0) {
          const tableRows = await tx
            .select({ status: tables.status })
            .from(tables)
            .where(and(eq(tables.id, existing.tableId), isNull(tables.deletedAt)));
          const tableRow = tableRows[0];
          const persistedTableStatus = tableRow?.status as
            TableStatus | 'CHECK_PRINTED' | undefined;
          const currentTableStatus =
            persistedTableStatus === 'CHECK_PRINTED' ? 'SERVED' : persistedTableStatus;
          const ACTIVE_SERVICE_STATUSES: readonly TableStatus[] = [
            'SEATED',
            'ORDERED',
            'SERVED',
            'PAYING',
          ];

          if (
            currentTableStatus !== undefined &&
            ACTIVE_SERVICE_STATUSES.includes(currentTableStatus)
          ) {
            const fromTableStatus = currentTableStatus;
            const nextTableStatus: TableStatus = tableMachine.can(fromTableStatus, 'FREE')
              ? 'FREE'
              : 'CLEANING';

            await tx
              .update(tables)
              .set({ status: nextTableStatus, statusChangedAt: new Date(), updatedAt: new Date() })
              .where(eq(tables.id, existing.tableId));

            await writeAudit(
              tx,
              { actorId: viewer.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
              {
                entity: 'tables',
                entityId: existing.tableId,
                action: 'TABLE_FREED_AFTER_VOID',
                before: { status: persistedTableStatus },
                after: { status: nextTableStatus },
              },
            );
          }
        }
      }
    });
  } catch (error) {
    if (error instanceof OrderActionRefusal) return { ok: false, error: error.message };
    if (error instanceof IllegalTransitionError) return { ok: false, error: error.message };
    throw error;
  }

  after(() => {
    revalidatePath('/floor');
    revalidatePath('/orders');
  });

  return { ok: true, error: null };
}

/* ------------------------------------------------------ void order lines */

const VoidOrderLinesInputSchema = z.object({
  orderId: z.uuid(),
  lineIds: z.array(z.uuid()).min(1),
});
export type VoidOrderLinesInput = z.infer<typeof VoidOrderLinesInputSchema>;

export interface VoidOrderLinesResult {
  readonly ok: boolean;
  readonly error: string | null;
}

/**
 * Void specific lines on an order still in play — the reducing/removing half
 * of "Save Order" on a loaded booked order (the Booked Orders flow,
 * 2026-08-27; docs/runfiles/M20-customer-capture.md). Scoped `voidOrderAction`:
 * same permission check and standard audit reason, just against the lines
 * the cashier actually touched rather than every line on the order.
 *
 * Reducing "4 Mutton Tikka" to "2" is not an in-place qty edit — the original
 * line is voided here, and a fresh line for the retained 2 goes out through
 * `placeOrderAction` at current menu pricing, the same append-only path a
 * brand new addition already takes. A line's `qty` is never mutated in place.
 */
export async function voidOrderLinesAction(
  input: VoidOrderLinesInput,
): Promise<VoidOrderLinesResult> {
  const parsed = VoidOrderLinesInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the request.' };
  }

  let identity: TillIdentity;
  try {
    identity = await requireTillStaff();
  } catch (error) {
    if (error instanceof Locked || error instanceof NotSignedIn) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
  const { viewer } = identity;

  try {
    assertPermission(viewer, 'order.void');
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: error.message };
    throw error;
  }

  const context = await requestContext();

  const db = dbWrite();

  try {
    await db.transaction(async (tx) => {
      const orderRows = await tx
        .select({ id: orders.id, status: orders.status })
        .from(orders)
        .where(and(eq(orders.id, parsed.data.orderId), isNull(orders.deletedAt)));
      const existing = orderRows[0];
      if (existing === undefined) throw new OrderActionRefusal('That order no longer exists.');

      // R5 — a finalized order's lines are frozen the same way the order
      // itself is; a voided order has nothing left to void further.
      const orderStatus = currentOrderStatus(existing.status as PersistedOrderStatus);
      if (orderStatus === 'FINALIZED' || orderStatus === 'VOIDED') {
        throw new OrderActionRefusal('This order can no longer be changed.');
      }

      const lineRows = await tx
        .select({ id: orderLines.id, voidReason: orderLines.voidReason })
        .from(orderLines)
        .where(
          and(
            eq(orderLines.orderId, parsed.data.orderId),
            inArray(orderLines.id, parsed.data.lineIds),
            isNull(orderLines.deletedAt),
          ),
        );

      for (const line of lineRows) {
        if (line.voidReason !== null) continue;

        await tx
          .update(orderLines)
          .set({ voidReason: OPERATOR_VOID_REASON, updatedAt: new Date() })
          .where(eq(orderLines.id, line.id));

        await writeAudit(
          tx,
          { actorId: viewer.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
          {
            entity: 'order_lines',
            entityId: line.id,
            action: 'ORDER_LINE_VOIDED',
            before: { voidReason: null },
            after: { voidReason: OPERATOR_VOID_REASON },
          },
        );
      }
    });
  } catch (error) {
    if (error instanceof OrderActionRefusal) return { ok: false, error: error.message };
    if (error instanceof IllegalTransitionError) return { ok: false, error: error.message };
    throw error;
  }

  after(() => {
    revalidatePath('/floor');
    revalidatePath('/orders');
  });

  return { ok: true, error: null };
}

/* ------------------------------------------------------- order customer */

const ReassignOrderTableInputSchema = z.object({
  orderId: z.uuid(),
  tableId: z.uuid(),
  guestCount: z.int().positive(),
});

export interface ReassignOrderTableResult {
  readonly ok: boolean;
  readonly error: string | null;
}

/** Move one running dine-in order to another available table atomically. */
export async function reassignOrderTableAction(
  input: z.infer<typeof ReassignOrderTableInputSchema>,
): Promise<ReassignOrderTableResult> {
  const parsed = ReassignOrderTableInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Choose a table.' };
  }

  let identity: TillIdentity;
  try {
    identity = await requireTillStaff();
  } catch (error) {
    if (error instanceof Locked || error instanceof NotSignedIn) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
  const { viewer } = identity;
  try {
    assertPermission(viewer, 'order.send');
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: error.message };
    throw error;
  }

  const db = dbWrite();
  const context = await requestContext();
  try {
    await db.transaction(async (tx) => {
      const order = await tx
        .select({
          id: orders.id,
          type: orders.type,
          status: orders.status,
          tableId: orders.tableId,
          tableSessionId: orders.tableSessionId,
        })
        .from(orders)
        .where(and(eq(orders.id, parsed.data.orderId), isNull(orders.deletedAt)))
        .for('update')
        .then((rows) => rows[0]);
      if (order === undefined) throw new OrderActionRefusal('That order no longer exists.');
      if (order.type !== 'DINE_IN') {
        throw new OrderActionRefusal('Only dine-in orders can be assigned to a table.');
      }
      if (order.status === 'FINALIZED' || order.status === 'VOIDED') {
        throw new OrderActionRefusal('This order is already closed.');
      }

      const destination = await tx
        .select({ id: tables.id, status: tables.status, maxSeats: tables.maxSeats })
        .from(tables)
        .where(and(eq(tables.id, parsed.data.tableId), isNull(tables.deletedAt)))
        .for('update')
        .then((rows) => rows[0]);
      if (destination === undefined) throw new OrderActionRefusal('That table no longer exists.');
      if (destination.maxSeats < parsed.data.guestCount) {
        throw new OrderActionRefusal('That table is too small for this party.');
      }

      if (order.tableId === destination.id) {
        await tx
          .update(orders)
          .set({ guestCount: parsed.data.guestCount, updatedAt: new Date() })
          .where(eq(orders.id, order.id));
        return;
      }
      if (destination.status !== 'FREE' && destination.status !== 'RESERVED') {
        throw new OrderActionRefusal('Choose a free or reserved table.');
      }
      const conflict = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.tableId, destination.id),
            isNull(orders.deletedAt),
            notInArray(orders.status, ['FINALIZED', 'VOIDED']),
            ne(orders.id, order.id),
          ),
        )
        .limit(1);
      if (conflict.length > 0) throw new OrderActionRefusal('That table already has an order.');

      const now = new Date();
      if (order.tableSessionId !== null) {
        await tx
          .update(tableSessions)
          .set({ closedAt: now, closedBy: viewer.id, updatedAt: now })
          .where(eq(tableSessions.id, order.tableSessionId));
      }
      const [newSession] = await tx
        .insert(tableSessions)
        .values({
          tableId: destination.id,
          guestCount: parsed.data.guestCount,
          waiterId: viewer.id,
          seatedBy: viewer.id,
        })
        .returning({ id: tableSessions.id });
      if (newSession === undefined) throw new Error('Could not open the destination table.');

      await tx
        .update(orders)
        .set({
          tableId: destination.id,
          tableSessionId: newSession.id,
          guestCount: parsed.data.guestCount,
          updatedAt: now,
        })
        .where(eq(orders.id, order.id));
      const destinationStatus: TableStatus = order.status === 'SERVED' ? 'SERVED' : 'ORDERED';
      await tx
        .update(tables)
        .set({ status: destinationStatus, statusChangedAt: now, updatedAt: now })
        .where(eq(tables.id, destination.id));

      if (order.tableId !== null) {
        const remaining = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(
            and(
              eq(orders.tableId, order.tableId),
              isNull(orders.deletedAt),
              notInArray(orders.status, ['FINALIZED', 'VOIDED']),
              ne(orders.id, order.id),
            ),
          )
          .limit(1);
        if (remaining.length === 0) {
          await tx
            .update(tables)
            .set({ status: 'FREE', statusChangedAt: now, updatedAt: now })
            .where(eq(tables.id, order.tableId));
        }
      }

      await writeAudit(
        tx,
        { actorId: viewer.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
        {
          entity: 'orders',
          entityId: order.id,
          action: 'ORDER_TABLE_REASSIGNED',
          before: { tableId: order.tableId },
          after: { tableId: destination.id, guestCount: parsed.data.guestCount },
        },
      );
    });
  } catch (error) {
    if (error instanceof OrderActionRefusal) return { ok: false, error: error.message };
    throw error;
  }

  after(() => {
    revalidatePath('/');
    revalidatePath('/floor');
    revalidatePath('/orders');
  });
  return { ok: true, error: null };
}

/* ------------------------------------------------------- order customer */

const SetOrderCustomerInputSchema = z.object({
  orderId: z.uuid(),
  /** Null clears the order back to plain "Walk-in Customer". */
  phone: z.string().trim().min(1).nullable(),
  name: z.string().trim().min(1).nullable(),
});
export type SetOrderCustomerInput = z.infer<typeof SetOrderCustomerInputSchema>;

export interface SetOrderCustomerResult {
  readonly ok: boolean;
  readonly error: string | null;
  readonly customerName: string | null;
  readonly customerPhone: string | null;
}

/**
 * Attach, change, or clear the customer on an order — ADR 0016;
 * docs/runfiles/M20-customer-capture.md §3.
 *
 * Found-or-created by phone in `customers` (the same table a "+"-added named
 * customer and a bare walk-in phone both resolve through), so a repeat
 * customer's second visit recognises the name already on file rather than
 * asking again. `# ponytail: two terminals typing the identical new phone
 * number in the same instant both pass the pre-insert lookup below and one
 * insert loses to `customers_phone_idx` — surfaces as an unhandled unique-
 * violation, not a silent duplicate; upgrade to `onConflictDoUpdate` against
 * the partial index only if this is ever actually observed.` Gated on
 * `order.send` — the same permission `placeOrderAction` already requires
 * for editing an order still in play (the runfile's own reasoning for not
 * inventing a narrower permission nothing in §14.1 names).
 */
export async function setOrderCustomerAction(
  input: SetOrderCustomerInput,
): Promise<SetOrderCustomerResult> {
  const parsed = SetOrderCustomerInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Check the request.',
      customerName: null,
      customerPhone: null,
    };
  }

  let identity: TillIdentity;
  try {
    identity = await requireTillStaff();
  } catch (error) {
    if (error instanceof Locked || error instanceof NotSignedIn) {
      return { ok: false, error: error.message, customerName: null, customerPhone: null };
    }
    throw error;
  }
  const { viewer } = identity;

  try {
    assertPermission(viewer, 'order.send');
  } catch (error) {
    if (error instanceof Forbidden) {
      return { ok: false, error: error.message, customerName: null, customerPhone: null };
    }
    throw error;
  }

  const db = dbWrite();
  const context = await requestContext();

  try {
    const result = await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: orders.id, status: orders.status })
        .from(orders)
        .where(and(eq(orders.id, parsed.data.orderId), isNull(orders.deletedAt)));
      const existing = rows[0];
      if (existing === undefined) throw new OrderActionRefusal('That order no longer exists.');
      if (existing.status === 'FINALIZED' || existing.status === 'VOIDED') {
        throw new OrderActionRefusal('This order is already closed.');
      }

      if (parsed.data.phone === null) {
        await tx
          .update(orders)
          .set({ customerId: null, updatedAt: new Date() })
          .where(eq(orders.id, existing.id));
        await writeAudit(
          tx,
          { actorId: viewer.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
          { entity: 'orders', entityId: existing.id, action: 'ORDER_CUSTOMER_CLEARED' },
        );
        return { customerName: null, customerPhone: null };
      }

      const phone = parsed.data.phone;
      const name = parsed.data.name;
      const matchRows = await tx
        .select({ id: customers.id, name: customers.name })
        .from(customers)
        .where(and(eq(customers.phone, phone), isNull(customers.deletedAt)));
      const match = matchRows[0];

      let customerId: string;
      let finalName: string | null;
      if (match === undefined) {
        const inserted = await tx
          .insert(customers)
          .values({ phone, name })
          .returning({ id: customers.id });
        const created = inserted[0];
        if (created === undefined) throw new Error('Inserting the customer returned no row.');
        customerId = created.id;
        finalName = name;
      } else {
        customerId = match.id;
        finalName = name ?? match.name;
        if (name !== null && name !== match.name) {
          await tx
            .update(customers)
            .set({ name, updatedAt: new Date() })
            .where(eq(customers.id, match.id));
        }
      }

      await tx
        .update(orders)
        .set({ customerId, updatedAt: new Date() })
        .where(eq(orders.id, existing.id));
      await writeAudit(
        tx,
        { actorId: viewer.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
        {
          entity: 'orders',
          entityId: existing.id,
          action: 'ORDER_CUSTOMER_SET',
          after: { customerId, phone },
        },
      );

      return { customerName: finalName, customerPhone: phone };
    });

    return { ok: true, error: null, ...result };
  } catch (error) {
    if (error instanceof OrderActionRefusal) {
      return { ok: false, error: error.message, customerName: null, customerPhone: null };
    }
    throw error;
  }
}

/* ------------------------------------------------------- order discount */

const SetOrderDiscountInputSchema = z.object({
  orderId: z.uuid(),
  /** Zero (with `reason: null`) clears the discount back off the order. */
  amount: PaisaSchema,
  reason: z.string().trim().min(1).nullable(),
});
/** `z.input`, not `z.infer` — same reasoning as `PlaceOrderInput` above: `amount` carries `PaisaSchema`'s `.transform()`, so this must describe the wire decimal-string the caller sends, not the already-parsed `Paisa` bigint the schema outputs server-side. */
export type SetOrderDiscountInput = z.input<typeof SetOrderDiscountInputSchema>;

export interface SetOrderDiscountResult {
  readonly ok: boolean;
  readonly error: string | null;
}

/**
 * Persist the order-level discount `DiscountDialog` collects — ADR 0017.
 *
 * §6.3's reference invoice prices "Order discount" into the taxable base;
 * before this, `orders` had no column for one, so `OrderScreen`'s local
 * `discount` state never reached `finalizeOrderAction` and a discount a
 * cashier applied on screen changed nothing about what the customer was
 * actually charged. `loadPriceableOrder` reads this column now, so finalize
 * picks it up with no new parameter of its own — this is the one place that
 * writes it, and the one place `discount.apply` is checked, deliberately, so
 * finalize never has to trust a client-asserted discount at the moment of
 * charging.
 */
export async function setOrderDiscountAction(
  input: SetOrderDiscountInput,
): Promise<SetOrderDiscountResult> {
  const parsed = SetOrderDiscountInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the request.' };
  }

  let identity: TillIdentity;
  try {
    identity = await requireTillStaff();
  } catch (error) {
    if (error instanceof Locked || error instanceof NotSignedIn) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
  const { viewer } = identity;

  try {
    assertPermission(viewer, 'discount.apply');
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: error.message };
    throw error;
  }

  const db = dbWrite();
  const context = await requestContext();

  try {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: orders.id, status: orders.status, orderDiscount: orders.orderDiscount })
        .from(orders)
        .where(and(eq(orders.id, parsed.data.orderId), isNull(orders.deletedAt)));
      const existing = rows[0];
      if (existing === undefined) throw new OrderActionRefusal('That order no longer exists.');
      if (existing.status === 'FINALIZED' || existing.status === 'VOIDED') {
        throw new OrderActionRefusal('This order is already closed.');
      }

      await tx
        .update(orders)
        .set({
          orderDiscount: parsed.data.amount,
          discountReason: parsed.data.reason,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, existing.id));

      await writeAudit(
        tx,
        { actorId: viewer.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
        {
          entity: 'orders',
          entityId: existing.id,
          action: 'ORDER_DISCOUNT_SET',
          before: { orderDiscount: existing.orderDiscount },
          after: { orderDiscount: parsed.data.amount, reason: parsed.data.reason },
        },
      );
    });
  } catch (error) {
    if (error instanceof OrderActionRefusal) return { ok: false, error: error.message };
    throw error;
  }

  return { ok: true, error: null };
}

/* ---------------------------------------------- service-charge override */

const SetServiceChargeOverrideInputSchema = z.object({
  orderId: z.uuid(),
  /** Null follows the admin default; zero disables the charge for this order. */
  rateBps: z.int().min(0).max(10_000).nullable(),
});

export interface SetServiceChargeOverrideResult {
  readonly ok: boolean;
  readonly error: string | null;
}

export async function setServiceChargeOverrideAction(
  input: z.infer<typeof SetServiceChargeOverrideInputSchema>,
): Promise<SetServiceChargeOverrideResult> {
  const parsed = SetServiceChargeOverrideInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the service charge.' };
  }
  let identity: TillIdentity;
  try {
    identity = await requireTillStaff();
  } catch (error) {
    if (error instanceof Locked || error instanceof NotSignedIn) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
  const { viewer } = identity;
  try {
    assertPermission(viewer, 'payment.take');
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: error.message };
    throw error;
  }

  const context = await requestContext();
  const db = dbWrite();
  try {
    await db.transaction(async (tx) => {
      const existing = await tx
        .select({
          id: orders.id,
          status: orders.status,
          type: orders.type,
          rateBps: orders.serviceChargeBpsOverride,
        })
        .from(orders)
        .where(and(eq(orders.id, parsed.data.orderId), isNull(orders.deletedAt)))
        .then((rows) => rows[0]);
      if (existing === undefined) throw new OrderActionRefusal('That order no longer exists.');
      if (existing.status === 'FINALIZED' || existing.status === 'VOIDED') {
        throw new OrderActionRefusal('This order is already closed.');
      }
      if (existing.type !== 'DINE_IN' && parsed.data.rateBps !== null) {
        throw new OrderActionRefusal('Service charge is available for dine-in orders only.');
      }
      await tx
        .update(orders)
        .set({ serviceChargeBpsOverride: parsed.data.rateBps, updatedAt: new Date() })
        .where(eq(orders.id, existing.id));
      await writeAudit(
        tx,
        { actorId: viewer.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
        {
          entity: 'orders',
          entityId: existing.id,
          action: 'ORDER_SERVICE_CHARGE_OVERRIDDEN',
          before: { rateBps: existing.rateBps },
          after: { rateBps: parsed.data.rateBps },
        },
      );
    });
  } catch (error) {
    if (error instanceof OrderActionRefusal) return { ok: false, error: error.message };
    throw error;
  }
  revalidatePath('/');
  revalidatePath('/orders');
  return { ok: true, error: null };
}

export async function setDeliveryDetailsAction(input: {
  orderId: string;
  deliveryAddress: string | null;
  deliveryCharge: string;
}): Promise<SetServiceChargeOverrideResult> {
  const parsed = z
    .object({
      orderId: z.uuid(),
      deliveryAddress: z.string().trim().min(1, 'Enter a delivery address.').max(1000),
      deliveryCharge: PaisaSchema.refine((v) => v >= 0n && v <= 100000000n),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the delivery details.' };
  }
  let identity: TillIdentity;
  try {
    identity = await requireTillStaff();
  } catch (error) {
    if (error instanceof Locked || error instanceof NotSignedIn) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
  const { viewer } = identity;
  try {
    assertPermission(viewer, 'payment.take');
  } catch (error) {
    if (error instanceof Forbidden) return { ok: false, error: error.message };
    throw error;
  }

  const context = await requestContext();
  const db = dbWrite();
  try {
    await db.transaction(async (tx) => {
      const existing = await tx
        .select({
          id: orders.id,
          status: orders.status,
          type: orders.type,
          deliveryAddress: orders.deliveryAddress,
          deliveryCharge: orders.deliveryCharge,
        })
        .from(orders)
        .where(and(eq(orders.id, parsed.data.orderId), isNull(orders.deletedAt)))
        .for('update')
        .then((rows) => rows[0]);
      if (existing === undefined) throw new OrderActionRefusal('That order no longer exists.');
      if (existing.status === 'FINALIZED' || existing.status === 'VOIDED') {
        throw new OrderActionRefusal('This order is already closed.');
      }
      if (existing.type !== 'DELIVERY') {
        throw new OrderActionRefusal('Delivery details are available for delivery orders only.');
      }
      await tx
        .update(orders)
        .set({
          deliveryAddress: parsed.data.deliveryAddress,
          deliveryCharge: parsed.data.deliveryCharge,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, existing.id));
      await writeAudit(
        tx,
        { actorId: viewer.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
        {
          entity: 'orders',
          entityId: existing.id,
          action: 'ORDER_DELIVERY_UPDATED',
          before: {
            deliveryAddress: existing.deliveryAddress,
            deliveryCharge: existing.deliveryCharge.toString(),
          },
          after: {
            deliveryAddress: parsed.data.deliveryAddress,
            deliveryCharge: parsed.data.deliveryCharge.toString(),
          },
        },
      );
    });
  } catch (error) {
    if (error instanceof OrderActionRefusal) return { ok: false, error: error.message };
    throw error;
  }
  revalidatePath('/');
  revalidatePath('/orders');
  return { ok: true, error: null };
}

/* --------------------------------------------------------- orders queue */

export interface OrdersQueueResult {
  readonly ok: boolean;
  readonly orders: readonly TrayOrder[];
  readonly zones: readonly string[];
  readonly error: string | null;
}

/**
 * The active-orders tray, callable from a client component — the order
 * screen's own "Orders" button opens `ActiveOrdersTray` in a dialog rather
 * than navigating to `/orders` (docs/decisions/0014-…), and a client
 * component cannot call the RSC-only `loadOrdersQueue` directly. Read-only;
 * lives here rather than in `queries.ts` because only a `'use server'` file
 * is reachable from the client this way.
 *
 * Used to also eagerly price every open order in the same call (one
 * `loadPriceableOrder` round trip per row, all fired concurrently) so a
 * later click opened instantly. On a busy service that meant the dialog's
 * *first* paint waited on the slowest of N concurrent order fetches instead
 * of one — the tray growing from a handful of tables to fifteen or twenty
 * turned "open the queue" into the visibly slow step, for pricing detail
 * nobody was about to read on 90% of those rows (2026-09-01, reported as
 * "View Booked Orders takes time to load all the orders"). `OrdersQueueDialog`
 * now fetches one order's detail, via `loadOrderDetailAction` below, only
 * once the cashier actually opens it.
 */
export async function loadOrdersQueueAction(): Promise<OrdersQueueResult> {
  let viewer;
  try {
    ({ viewer } = await requireTillStaff());
  } catch (error) {
    if (error instanceof Locked || error instanceof NotSignedIn) {
      return { ok: false, orders: [], zones: [], error: error.message };
    }
    throw error;
  }

  const { orders: trayOrders, zones: activeZones } = await loadOrdersQueue(viewer);
  return { ok: true, orders: trayOrders, zones: activeZones, error: null };
}

export interface OrderDetailResult {
  readonly ok: boolean;
  readonly order: Order | null;
  readonly error: string | null;
}

/**
 * One order's full priced detail — what picking a row in the booked-orders
 * dialog actually needs, and the on-demand replacement for the eager
 * all-orders prefetch `loadOrdersQueueAction` used to do (see its own doc
 * comment). `dbRead` (R2): a pure read, same posture as `loadPriceableOrders`.
 */
export async function loadOrderDetailAction(orderId: string): Promise<OrderDetailResult> {
  try {
    await requireTillStaff();
  } catch (error) {
    if (error instanceof Locked || error instanceof NotSignedIn) {
      return { ok: false, order: null, error: error.message };
    }
    throw error;
  }

  const priceable = await loadPriceableOrder(dbRead(), orderId);
  if (priceable === null) {
    return { ok: false, order: null, error: 'That order is no longer available.' };
  }
  return { ok: true, order: priceable.order, error: null };
}

/* ------------------------------------------------------ bill print trail */

const RecordBillPrintInputSchema = z.object({
  orderId: z.uuid(),
  /** The figure on the paper the customer was handed, as the cart computed it. */
  grandTotal: PaisaSchema,
  printed: z.boolean(),
});

/** `z.input`, not `z.infer` — `grandTotal` carries `PaisaSchema`'s `.transform()`, so the caller sends the wire string. Same reasoning as `SetOrderDiscountInput` above. */
export type RecordBillPrintInput = z.input<typeof RecordBillPrintInputSchema>;

export interface RecordBillPrintResult {
  readonly ok: boolean;
  readonly error: string | null;
}

/**
 * Record that a bill was shown or printed for an order — ADR 0027.
 *
 * The threat this closes is the oldest one in restaurant cash handling, and
 * ADR 0019 reopened it by accident. A bill preview is a document that looks
 * like a total and is handed to a customer, but until now it was produced
 * entirely on the client: `View bill` opened a dialog and `Print bill` called
 * `window.print()`, and neither touched the server. An operator could take a
 * table's money against a piece of paper the system had never heard of, then
 * simply never finalize. Nothing in the register, the Z report, the exceptions
 * report or the audit log would ever show that the sale had happened, because
 * from the system's point of view it had not.
 *
 * §6.13's abandoned-check signal used to catch exactly this. ADR 0019 removed
 * it along with the printed check and recorded that it had "no replacement".
 * This is the replacement, rebuilt against the document that actually still
 * exists.
 *
 * The audit row is the whole control. It names the actor (R7), the order, the
 * amount quoted, and whether paper came out — and `readBillNotFinalizedExceptions`
 * then reports any order that got one and never became an invoice. The
 * deterrent is not that the print is blocked; it is that it is now impossible
 * to quote a customer a total without leaving a row with the operator's name
 * on it that a manager reviews the next morning.
 *
 * Deliberately not a mutation of `orders`. Nothing about the order changes by
 * being read aloud, and R5/R9 leave no column this belongs in — the event is
 * the record.
 */
export async function recordBillPrintAction(
  input: RecordBillPrintInput,
): Promise<RecordBillPrintResult> {
  const parsed = RecordBillPrintInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the request.' };
  }

  let identity: TillIdentity;
  try {
    identity = await requireTillStaff();
  } catch (error) {
    if (error instanceof Locked || error instanceof NotSignedIn) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
  const { viewer } = identity;

  const db = dbWrite();
  const context = await requestContext();

  try {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: orders.id, orderNo: orders.orderNo, status: orders.status })
        .from(orders)
        .where(and(eq(orders.id, parsed.data.orderId), isNull(orders.deletedAt)));
      const existing = rows[0];
      if (existing === undefined) throw new OrderActionRefusal('That order no longer exists.');

      await writeAudit(
        tx,
        { actorId: viewer.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
        {
          entity: 'orders',
          entityId: existing.id,
          action: parsed.data.printed ? 'ORDER_BILL_PRINTED' : 'ORDER_BILL_VIEWED',
          after: {
            orderNo: existing.orderNo,
            status: existing.status,
            grandTotal: parsed.data.grandTotal,
          },
        },
      );
    });
  } catch (error) {
    if (error instanceof OrderActionRefusal) return { ok: false, error: error.message };
    throw error;
  }

  return { ok: true, error: null };
}
