import { NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import {
  allocateLocalNo,
  dbWrite,
  invoiceTaxLines,
  invoices,
  nextOrderNoFrom,
  orderLineModifiers,
  orderLines,
  orders,
  payments,
  readMaxOrderNo,
  shifts,
  tableSessions,
  tables,
  taxClasses,
  withIdempotency,
  withOrderNoRetry,
  writeAudit,
} from '@natech/db';
import {
  buildTaxSnapshot,
  computeTotals,
  tableMachine,
  type OrderLine as DomainOrderLine,
} from '@natech/domain';
import {
  PaisaSchema,
  QtySchema,
  SyncRequestSchema,
  type QueuedOrder,
  type SyncResult,
  type TableStatus,
} from '@natech/contracts';
import {
  Locked,
  NotSignedIn,
  assertPermission,
  requestContext,
  requireTillStaff,
} from '@/lib/auth/session';
import { currentBusinessDate } from '@/lib/orders/businessDate';
import { readTaxPolicy, readTaxRules, withServiceChargeOverride } from '@/lib/tax/queries';
import { FLOOR_CHANNEL, getRealtime } from '@natech/realtime';

/**
 * The offline replay endpoint — BUILD-PLAN.md §8, §2 R2/R3/R7/R9/R10;
 * docs/runfiles/M16-offline.md §2/§3.
 *
 * Each `QueuedOrder` replays inside its own `withIdempotency`-guarded
 * transaction, keyed on `client_order_uuid` — the same key `orders`' own
 * partial unique index already enforces (R3, §8). This writes *history*, not
 * a live transition: unlike `placeOrderAction`/`finalizeOrderAction`, it
 * never calls `orderMachine` against the order it is inserting, because the
 * sale already happened, in full, before this call exists — see the
 * runfile's §2/§3 on why an offline sale is captured as one flat object
 * rather than separate queued steps.
 *
 * Tax is recomputed authoritatively from the real rules/policy (R9) exactly
 * as `finalizeOrderAction` does, and compared against what the terminal
 * itself computed for `TAX_DRIFT` (ADR 0013 — an audit row, since Sentry was
 * removed in ADR 0006).
 *
 * A reconnect can carry up to 200 queued orders in one request. Each order is
 * validated and committed locally without an additional external round trip,
 * keeping recovery predictable when connectivity returns.
 */

function toDomainLine(line: QueuedOrder['lines'][number]): DomainOrderLine {
  return {
    id: line.clientLineUuid,
    name: line.nameSnapshot,
    nameUr: line.nameUrSnapshot,
    taxClass: line.taxClass,
    unitPrice: PaisaSchema.parse(line.unitPrice),
    qty: QtySchema.parse(line.qty),
    lineDiscount: PaisaSchema.parse(line.lineDiscount),
    modifiers: line.modifiers.map((modifier) => ({
      name: modifier.nameSnapshot,
      nameUr: modifier.nameUrSnapshot,
      priceDelta: PaisaSchema.parse(modifier.priceDelta),
    })),
    isVoid: false,
  };
}

function failure(clientOrderUuid: string, error: string): SyncResult {
  return {
    clientOrderUuid,
    accepted: false,
    localNo: null,
    invoiceId: null,
    serverGrandTotal: null,
    drift: false,
    error,
  };
}

interface ReplayContext {
  readonly viewerId: string;
  /** The authenticated binding's own terminal — never the client-submitted one (defence in depth, the same "never trust a client-submitted total" posture §9 already holds for money). */
  readonly terminalId: string;
  readonly taxPolicy: Awaited<ReturnType<typeof readTaxPolicy>>;
  readonly taxRules: Awaited<ReturnType<typeof readTaxRules>>;
  readonly ip: string | undefined;
  readonly ua: string | undefined;
}

async function replayOne(queued: QueuedOrder, ctx: ReplayContext): Promise<SyncResult> {
  try {
    // `queued.orderNo` is what the terminal printed on its own provisional
    // receipt while offline — display continuity, the same placeholder-number
    // convention `OrderScreen`'s live cart preview already uses (M10's own
    // disclosed gap). It is never the value written to `orders.order_no`:
    // that has to be collision-free against every *other* order on the same
    // business date, including ones placed online by a different terminal
    // while this one was down, so it is allocated fresh here, inside the
    // transaction, the same `readMaxOrderNo`/`nextOrderNoFrom`/
    // `withOrderNoRetry` pattern `placeOrderAction` already uses — wrapping
    // the whole transaction, not nested inside it, for the same reason that
    // file's own doc comment gives: a poisoned transaction cannot be
    // salvaged with a savepoint here alone (CLAUDE.md's trap).
    const outcome = await withOrderNoRetry(() =>
      dbWrite().transaction((tx) =>
        withIdempotency(tx, queued.clientOrderUuid, 'sync.order', async (): Promise<SyncResult> => {
          // Shift close is blocked offline. Lock that still-open register so
          // replay and close serialize and the recovered invoice is included
          // in exactly one Z report.
          const [openShift] = await tx
            .select({ id: shifts.id })
            .from(shifts)
            .where(eq(shifts.status, 'OPEN'))
            .limit(1)
            .for('update');
          if (openShift === undefined) {
            throw new Error('Open the register before syncing offline sales.');
          }
          const domainLines = queued.lines.map(toDomainLine);
          const approvedPayments = queued.payments.filter((p) => p.attemptStatus === 'APPROVED');
          if (approvedPayments.length === 0) {
            throw new Error('At least one approved payment is required.');
          }

          const effectiveTaxPolicy = withServiceChargeOverride(
            ctx.taxPolicy,
            queued.serviceChargeBpsOverride,
            queued.type,
          );
          const totals = computeTotals({
            lines: domainLines,
            orderType: queued.type,
            deliveryCharge: PaisaSchema.parse(queued.deliveryCharge ?? '0'),
            orderDiscount: PaisaSchema.parse(queued.orderDiscount),
            serviceStartedAt: new Date(queued.serviceStartedAt),
            rules: ctx.taxRules,
            policy: effectiveTaxPolicy,
            payments: approvedPayments.map((p) => ({
              method: p.method,
              amount: PaisaSchema.parse(p.amount),
            })),
          });

          const taken = approvedPayments.reduce((sum, p) => sum + PaisaSchema.parse(p.amount), 0n);
          if (taken !== totals.grandTotal) {
            throw new Error(
              `The amount taken (${taken}) does not match the total due (${totals.grandTotal}).`,
            );
          }

          const openedAt = new Date(queued.openedAt);
          const serviceStartedAt = new Date(queued.serviceStartedAt);
          const businessDate = await currentBusinessDate(tx, openedAt);
          const maxOrderNo = await readMaxOrderNo(tx, businessDate);
          const orderNo = nextOrderNoFrom(maxOrderNo);

          const taxClassRows = await tx
            .select({ id: taxClasses.id, key: taxClasses.key })
            .from(taxClasses);
          const taxClassIdByKey = new Map(taxClassRows.map((row) => [row.key, row.id]));

          const [insertedOrder] = await tx
            .insert(orders)
            .values({
              orderNo,
              channel: 'POS',
              type: queued.type,
              tableId: queued.tableId,
              guestCount: queued.guestCount,
              waiterId: queued.waiterId,
              terminalId: ctx.terminalId,
              status: 'FINALIZED',
              note: queued.note,
              // ADR 0017 — `totals` above already priced this correctly; this
              // is just the `orders` row itself carrying the same figure now
              // that the column exists. `QueuedOrderSchema` has no reason
              // field for the offline path (unlike the online one, set
              // through `setOrderDiscountAction`), so this is amount-only.
              orderDiscount: PaisaSchema.parse(queued.orderDiscount),
              deliveryAddress: queued.type === 'DELIVERY' ? queued.deliveryAddress : null,
              deliveryCharge:
                queued.type === 'DELIVERY' ? BigInt(queued.deliveryCharge ?? '0') : 0n,
              serviceChargeBpsOverride: queued.serviceChargeBpsOverride,
              clientOrderUuid: queued.clientOrderUuid,
              businessDate,
              serviceStartedAt,
            })
            .returning({ id: orders.id });
          if (insertedOrder === undefined)
            throw new Error('Inserting the offline order returned no row.');

          for (const line of queued.lines) {
            const [insertedLine] = await tx
              .insert(orderLines)
              .values({
                orderId: insertedOrder.id,
                menuItemId: line.menuItemId,
                variantId: line.variantId,
                nameSnapshot: line.nameSnapshot,
                nameUrSnapshot: line.nameUrSnapshot,
                qty: line.qty,
                unitPrice: BigInt(line.unitPrice),
                lineDiscount: BigInt(line.lineDiscount),
                taxClassId: taxClassIdByKey.get(line.taxClass) ?? null,
                seatNo: line.seatNo,
                note: line.note,
              })
              .returning({ id: orderLines.id });
            if (insertedLine === undefined)
              throw new Error('Inserting an offline order line returned no row.');

            if (line.modifiers.length > 0) {
              await tx.insert(orderLineModifiers).values(
                line.modifiers.map((modifier) => ({
                  orderLineId: insertedLine.id,
                  modifierId: modifier.modifierId,
                  nameSnapshot: modifier.nameSnapshot,
                  nameUrSnapshot: modifier.nameUrSnapshot,
                  priceDelta: BigInt(modifier.priceDelta),
                })),
              );
            }
          }

          const localNo = await allocateLocalNo(tx);
          const now = new Date();
          const snapshot = buildTaxSnapshot(totals, effectiveTaxPolicy, serviceStartedAt, now);

          const [insertedInvoice] = await tx
            .insert(invoices)
            .values({
              orderId: insertedOrder.id,
              terminalId: ctx.terminalId,
              shiftId: openShift.id,
              localNo,
              businessDate,
              subtotal: totals.subtotal,
              discountTotal: totals.discountTotal,
              taxableBase: totals.taxableBase,
              taxTotal: totals.taxTotal,
              deliveryCharge: totals.deliveryCharge ?? 0n,
              serviceCharge: totals.serviceCharge,
              posFee: totals.posFee,
              roundingAdj: totals.roundingAdj,
              grandTotal: totals.grandTotal,
              taxSnapshot: snapshot,
              finalizedBy: ctx.viewerId,
              finalizedAt: now,
            })
            .returning();
          if (insertedInvoice === undefined)
            throw new Error('Inserting the offline invoice returned no row.');

          await tx.insert(invoiceTaxLines).values(
            totals.taxLines.map((line) => ({
              invoiceId: insertedInvoice.id,
              taxClassId: taxClassIdByKey.get(line.taxClass) ?? null,
              rateBps: line.rateBps,
              base: line.base,
              amount: line.amount,
              paymentMethodScope: line.paymentMethodScope,
            })),
          );

          await tx.insert(payments).values(
            queued.payments.map((p) => ({
              invoiceId: insertedInvoice.id,
              method: p.method,
              amount: BigInt(p.amount),
              tendered: p.tendered === null ? null : BigInt(p.tendered),
              change: p.change === null ? null : BigInt(p.change),
              cardLast4: p.cardLast4,
              attemptStatus: p.attemptStatus,
              declinedReason: p.declinedReason,
            })),
          );

          // Best-effort floor cleanup for a delayed replay — `.can()`, never
          // `.assert()`: real time has passed and the table may already be in
          // any state through ordinary floor activity since (runfile §3).
          if (queued.tableId !== null) {
            const tableRows = await tx
              .select({ status: tables.status })
              .from(tables)
              .where(and(eq(tables.id, queued.tableId), isNull(tables.deletedAt)));
            const tableStatus = tableRows[0]?.status as TableStatus | undefined;
            if (tableStatus !== undefined && tableMachine.can(tableStatus, 'CLEANING')) {
              await tx
                .update(tables)
                .set({ status: 'CLEANING', statusChangedAt: now, updatedAt: now })
                .where(eq(tables.id, queued.tableId));
            }

            const openSessionRows = await tx
              .select({ id: tableSessions.id })
              .from(tableSessions)
              .where(
                and(eq(tableSessions.tableId, queued.tableId), isNull(tableSessions.closedAt)),
              );
            const openSession = openSessionRows[0];
            if (openSession !== undefined) {
              await tx
                .update(tableSessions)
                .set({ closedAt: now })
                .where(eq(tableSessions.id, openSession.id));
            }
          }

          // §8 — TAX_DRIFT: what the terminal printed against what the server
          // just recomputed authoritatively. ADR 0013 — an audit row, since
          // Sentry was removed (ADR 0006), not a paging alert.
          const clientGrandTotal =
            queued.clientGrandTotal === null ? null : PaisaSchema.parse(queued.clientGrandTotal);
          const clientTaxTotal =
            queued.clientTaxTotal === null ? null : PaisaSchema.parse(queued.clientTaxTotal);
          const drift =
            (clientGrandTotal !== null && clientGrandTotal !== totals.grandTotal) ||
            (clientTaxTotal !== null && clientTaxTotal !== totals.taxTotal);

          await writeAudit(
            tx,
            { actorId: ctx.viewerId, ip: ctx.ip, ua: ctx.ua },
            {
              entity: 'invoices',
              entityId: insertedInvoice.id,
              action: 'OFFLINE_SYNCED',
              after: { orderNo, localNo, grandTotal: totals.grandTotal.toString() },
            },
          );

          if (drift) {
            await writeAudit(
              tx,
              { actorId: ctx.viewerId, ip: ctx.ip, ua: ctx.ua },
              {
                entity: 'invoices',
                entityId: insertedInvoice.id,
                action: 'TAX_DRIFT',
                before: {
                  clientGrandTotal: clientGrandTotal?.toString() ?? null,
                  clientTaxTotal: clientTaxTotal?.toString() ?? null,
                  clientEngineVersion: queued.clientEngineVersion,
                },
                after: {
                  serverGrandTotal: totals.grandTotal.toString(),
                  serverTaxTotal: totals.taxTotal.toString(),
                },
              },
            );
          }

          return {
            clientOrderUuid: queued.clientOrderUuid,
            accepted: true,
            localNo,
            invoiceId: insertedInvoice.id,
            serverGrandTotal: totals.grandTotal.toString(),
            drift,
            error: null,
          };
        }),
      ),
    );

    return outcome.result;
  } catch (error) {
    return failure(
      queued.clientOrderUuid,
      error instanceof Error ? error.message : 'Replay failed.',
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  let identity;
  try {
    identity = await requireTillStaff();
  } catch (error) {
    if (error instanceof Locked || error instanceof NotSignedIn) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    throw error;
  }
  const { viewer, binding } = identity;

  try {
    assertPermission(viewer, 'payment.take');
  } catch {
    return NextResponse.json({ error: 'Not permitted to finalize a sale.' }, { status: 403 });
  }

  const parsed = SyncRequestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid sync payload.' },
      { status: 400 },
    );
  }

  const [taxPolicy, taxRules, context] = await Promise.all([
    readTaxPolicy(),
    readTaxRules(),
    requestContext(),
  ]);

  const ctx: ReplayContext = {
    viewerId: viewer.id,
    terminalId: binding.terminalId,
    taxPolicy,
    taxRules,
    ip: context.ip ?? undefined,
    ua: context.ua ?? undefined,
  };

  const results: SyncResult[] = [];
  for (const queued of parsed.data.orders) {
    results.push(await replayOne(queued, ctx));
  }

  if (results.some((result) => result.accepted)) {
    await getRealtime().channel(FLOOR_CHANNEL).emit('floor.changed', {});
  }

  return NextResponse.json({ results, serverTime: new Date().toISOString() });
}
