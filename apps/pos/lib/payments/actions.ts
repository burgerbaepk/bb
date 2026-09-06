'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  allocateLocalNo,
  dbWrite,
  invoiceTaxLines,
  invoices,
  orders,
  payments,
  shifts,
  taxClasses,
  writeAudit,
} from '@natech/db';
import {
  IllegalTransitionError,
  buildTaxSnapshot,
  computeTotals,
  orderMachine,
  paisa,
  type Totals,
} from '@natech/domain';
import { buildEscPosBuffer } from '@natech/print-bridge/escpos';
import { OutletConfigSchema, PaymentSliceDraftSchema } from '@natech/contracts';
import type { Invoice, PaymentSliceDraft } from '@natech/contracts';
import { FLOOR_CHANNEL, getRealtime } from '@natech/realtime';
import {
  Forbidden,
  Locked,
  NotSignedIn,
  assertPermission,
  requireTillStaff,
} from '../auth/session';
import type { TillIdentity } from '../auth/session';
import { currentBusinessDate } from '../orders/businessDate';
import { loadPriceableOrder } from '../orders/pricing';
import { invoiceEscPosDocument } from '../printing/documents';
import { readInvoiceStorefrontUrl } from '../seo/queries';
import { readBrandConfig } from '../branding/queries';
import { readOutletConfig } from '../outlet/queries';
import {
  readActivePrintPath,
  readTaxPolicy,
  readTaxRules,
  withServiceChargeOverride,
} from '../tax/queries';

/**
 * Finalize — BUILD-PLAN.md §5.8, §6.2, §6.6, §6.12, §2 R5/R7/R9/R10;
 * docs/runfiles/M10-check-and-payment.md §3.
 *
 * The one place a sale becomes a fiscal fact. Recomputes `computeTotals`
 * server-side from the order's real, persisted `order_lines` and the real
 * policy/rules — never from a client-submitted total (see this runfile's §3:
 * a compromised or buggy client could otherwise finalize at any figure it
 * likes). The client sends only what a payment physically is — which
 * methods, how much against each, which attempts were declined — the same
 * `PaymentSliceDraft[]` shape `PaymentSheet` already collects.
 *
 * Does not touch `fiscal_outbox`. M11 owns the outbox, the inline
 * transmission attempt, and the PRA/FBR adapters; this action stops the
 * moment the invoice, its tax lines, and its payments are written.
 */
class FinalizeRefusal extends Error {}

const FinalizeOrderInputSchema = z.object({
  orderId: z.uuid(),
  slices: z.array(PaymentSliceDraftSchema).min(1),
  /** Retained for wire compatibility; printing uses a fresh server-side outlet read. */
  outlet: OutletConfigSchema,
});
/**
 * `z.input`, not `z.infer`/`z.output` — same reasoning as
 * `placeOrderAction`'s `PlaceOrderInput` (`lib/orders/actions.ts`):
 * `PaymentSliceDraftSchema.amount` carries `PaisaSchema`'s `.transform()`, so
 * `z.infer` would describe the already-parsed `Paisa` *bigint* this action
 * ends up with server-side, not the wire decimal-string the caller actually
 * has to send. Using `z.infer` here previously let a raw `Paisa` slice
 * (`PaymentSheet`'s own in-memory shape, correctly a bigint per R1) compile
 * straight through to this action's `slices` argument with no error, and fail
 * at runtime instead — "Invalid input: expected string, received bigint".
 */
export type FinalizeOrderInput = z.input<typeof FinalizeOrderInputSchema>;

export interface FinalizeOrderResult {
  readonly ok: boolean;
  readonly error: string | null;
  readonly invoice: Invoice | null;
  /** §12 paths 1/2 — base64 ESC/POS bytes for the tax invoice. */
  readonly escPosBase64: string | null;
}

function toInvoiceView(
  row: typeof invoices.$inferSelect,
  totals: Totals,
  taxLineIds: readonly string[],
  slices: readonly PaymentSliceDraft[],
  paymentIds: readonly string[],
  paymentAt: Date,
  finalizedByName: string | null,
  terminalLabel: string | null,
): Invoice {
  return {
    id: row.id,
    orderId: row.orderId,
    localNo: row.localNo,
    businessDate: row.businessDate,
    finalizedAt: row.finalizedAt,
    finalizedByName,
    terminalLabel,
    status: row.status,
    subtotal: paisa(row.subtotal),
    discountTotal: paisa(row.discountTotal),
    taxableBase: paisa(row.taxableBase),
    taxTotal: paisa(row.taxTotal),
    deliveryCharge: paisa(row.deliveryCharge),
    serviceCharge: paisa(row.serviceCharge),
    posFee: paisa(row.posFee),
    roundingAdj: paisa(row.roundingAdj),
    grandTotal: paisa(row.grandTotal),
    taxLines: totals.taxLines.map((line, index) => ({
      id: taxLineIds[index] ?? line.taxClass,
      taxClass: line.taxClass,
      rateBps: line.rateBps,
      base: line.base,
      amount: line.amount,
      paymentMethodScope: line.paymentMethodScope,
    })),
    payments: slices.map((slice, index) => ({
      id: paymentIds[index] ?? `${slice.method}-${index}`,
      method: slice.method,
      amount: slice.amount,
      tendered: null,
      change: null,
      cardLast4: null,
      terminalRef: null,
      taxRateAppliedBps: null,
      attemptStatus: slice.attemptStatus,
      declinedReason: slice.declinedReason,
      at: paymentAt,
    })),
    printedCount: row.printedCount,
  };
}

export async function finalizeOrderAction(input: FinalizeOrderInput): Promise<FinalizeOrderResult> {
  const parsed = FinalizeOrderInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Check the request.',
      invoice: null,
      escPosBase64: null,
    };
  }

  let identity: TillIdentity;
  try {
    identity = await requireTillStaff();
  } catch (error) {
    if (error instanceof Locked || error instanceof NotSignedIn)
      return { ok: false, error: error.message, invoice: null, escPosBase64: null };
    throw error;
  }
  const { viewer, binding } = identity;

  try {
    assertPermission(viewer, 'payment.take');
  } catch (error) {
    if (error instanceof Forbidden)
      return { ok: false, error: error.message, invoice: null, escPosBase64: null };
    throw error;
  }

  const [taxPolicy, taxRules, currentOutlet, activePrintPath] = await Promise.all([
    readTaxPolicy(),
    readTaxRules(),
    readOutletConfig(),
    readActivePrintPath(),
  ]);
  if (currentOutlet === null) {
    return {
      ok: false,
      error: 'Outlet settings are incomplete. Complete them before finalizing an invoice.',
      invoice: null,
      escPosBase64: null,
    };
  }

  const db = dbWrite();
  try {
    const result = await db.transaction(async (tx) => {
      // Lock the live register for the duration of finalization. A concurrent
      // close waits here, so an invoice can never land after its Z report.
      const [openShift] = await tx
        .select({ id: shifts.id })
        .from(shifts)
        .where(eq(shifts.status, 'OPEN'))
        .limit(1)
        .for('update');
      if (openShift === undefined) {
        throw new FinalizeRefusal('Open the register before taking payment.');
      }

      const priceable = await loadPriceableOrder(tx, parsed.data.orderId);
      if (priceable === null) throw new FinalizeRefusal('That order cannot be finalized yet.');
      const { order, domainLines } = priceable;

      // ADR 0018 removed the kitchen workflow that used to advance a POS
      // order from PLACED to SERVED, but left that edge in the lifecycle.
      // Payment is the first authoritative signal that service has completed,
      // so record the missing edge here, atomically before finalization. Do
      // not weaken the machine to allow PLACED → FINALIZED: keeping both
      // transitions preserves the lifecycle and its audit history.
      let finalizableStatus = order.status;
      if (finalizableStatus === 'PLACED') {
        orderMachine.assert(finalizableStatus, 'SERVED');
        const servedAt = new Date();
        await tx
          .update(orders)
          .set({ status: 'SERVED', updatedAt: servedAt })
          .where(eq(orders.id, order.id));
        await writeAudit(
          tx,
          { actorId: viewer.id },
          {
            entity: 'orders',
            entityId: order.id,
            action: 'ORDER_SERVED',
            before: { status: 'PLACED' },
            after: { status: 'SERVED' },
          },
        );
        finalizableStatus = 'SERVED';
      }

      // R5, expressed as a machine edge: FINALIZED has none, so a second
      // finalize attempt on an already-finalized order still fails here.
      orderMachine.assert(finalizableStatus, 'FINALIZED');

      const approved = parsed.data.slices.filter((slice) => slice.attemptStatus === 'APPROVED');
      if (approved.length === 0)
        throw new FinalizeRefusal('At least one approved payment is required.');

      const effectiveTaxPolicy = withServiceChargeOverride(
        taxPolicy,
        order.serviceChargeBpsOverride,
        order.type,
      );
      const totals = computeTotals({
        lines: domainLines,
        orderType: order.type,
        deliveryCharge: order.deliveryCharge,
        serviceStartedAt: order.serviceStartedAt,
        rules: taxRules,
        policy: effectiveTaxPolicy,
        payments: approved.map((slice) => ({ method: slice.method, amount: slice.amount })),
        // ADR 0017 — the actual charge: read off `order.orderDiscount`, never
        // a client-supplied parameter, so this never has to trust a discount
        // it did not itself authorize.
        orderDiscount: order.orderDiscount,
      });

      const taken = approved.reduce((sum, slice) => sum + slice.amount, 0n as bigint);
      if (taken !== totals.grandTotal) {
        throw new FinalizeRefusal(
          `The amount taken (${taken}) does not match the total due (${totals.grandTotal}).`,
        );
      }

      const businessDate = await currentBusinessDate(tx);
      const localNo = await allocateLocalNo(tx);
      const now = new Date();
      const snapshot = buildTaxSnapshot(totals, effectiveTaxPolicy, order.serviceStartedAt, now);

      const [insertedInvoice] = await tx
        .insert(invoices)
        .values({
          orderId: order.id,
          terminalId: binding.terminalId,
          shiftId: openShift.id,
          localNo,
          businessDate,
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          taxableBase: totals.taxableBase,
          taxTotal: totals.taxTotal,
          deliveryCharge: totals.deliveryCharge ?? paisa(0n),
          serviceCharge: totals.serviceCharge,
          posFee: totals.posFee,
          roundingAdj: totals.roundingAdj,
          grandTotal: totals.grandTotal,
          taxSnapshot: snapshot,
          finalizedBy: viewer.id,
          finalizedAt: now,
        })
        .returning();
      if (insertedInvoice === undefined)
        throw new FinalizeRefusal('The invoice could not be saved.');

      const taxClassRows = await tx
        .select({ id: taxClasses.id, key: taxClasses.key })
        .from(taxClasses);
      const taxClassIdByKey = new Map(taxClassRows.map((r) => [r.key, r.id]));

      const insertedTaxLines =
        totals.taxLines.length === 0
          ? []
          : await tx
              .insert(invoiceTaxLines)
              .values(
                totals.taxLines.map((line) => ({
                  invoiceId: insertedInvoice.id,
                  taxClassId: taxClassIdByKey.get(line.taxClass) ?? null,
                  rateBps: line.rateBps,
                  base: line.base,
                  amount: line.amount,
                  paymentMethodScope: line.paymentMethodScope,
                })),
              )
              .returning({ id: invoiceTaxLines.id });

      const insertedPayments = await tx
        .insert(payments)
        .values(
          parsed.data.slices.map((slice) => ({
            invoiceId: insertedInvoice.id,
            method: slice.method,
            amount: slice.amount,
            attemptStatus: slice.attemptStatus,
            declinedReason: slice.declinedReason,
          })),
        )
        .returning({ id: payments.id });

      await tx
        .update(orders)
        .set({ status: 'FINALIZED', updatedAt: now })
        .where(eq(orders.id, order.id));

      // Finalizing an invoice must not make an operational decision about
      // the dining room. Table status and seating sessions are managed from
      // the floor screen, independently of the fiscal transaction. Besides
      // matching the operator's intent, this prevents an unrelated table
      // transition from rolling back an otherwise valid invoice.

      await writeAudit(
        tx,
        { actorId: viewer.id },
        {
          entity: 'invoices',
          entityId: insertedInvoice.id,
          action: 'FINALIZED',
          after: { orderId: order.id, localNo, grandTotal: totals.grandTotal.toString() },
        },
      );

      const invoice = toInvoiceView(
        insertedInvoice,
        totals,
        insertedTaxLines.map((row) => row.id),
        parsed.data.slices,
        insertedPayments.map((row) => row.id),
        now,
        viewer.displayName,
        binding.terminalLabel,
      );
      return { order, invoice };
    });

    // Cache invalidation and realtime notification happen after the fiscal
    // transaction. Neither needs to delay the cashier receiving the invoice.
    after(async () => {
      revalidatePath('/floor');
      revalidatePath('/orders');
      revalidatePath('/');
      const realtimeResult = await Promise.resolve(
        getRealtime().channel(FLOOR_CHANNEL).emit('floor.changed', {}),
      ).then(
        () => ({ status: 'fulfilled' as const }),
        (reason: unknown) => ({ status: 'rejected' as const, reason }),
      );
      if (realtimeResult.status === 'rejected') {
        console.error(
          'finalizeOrderAction: post-commit notification failed',
          realtimeResult.reason,
        );
      }
    });

    // HTML printing renders from the returned invoice in the browser. Avoid
    // building an unused ESC/POS document here: it can involve fetching and
    // rasterizing a logo and every Urdu item name.
    let escPosBase64: string | null = null;
    if (activePrintPath !== 'HTML_DIALOG') {
      const [branding, storefrontUrl] = await Promise.all([
        readBrandConfig(),
        readInvoiceStorefrontUrl(),
      ]);
      const buffer = buildEscPosBuffer(
        await invoiceEscPosDocument(currentOutlet, result.order, result.invoice, {
          storefrontUrl,
          showUrdu: branding.receipt.showUrdu,
          logoReceiptUrl:
            branding.identity.logoReceipt === '' ? null : branding.identity.logoReceipt,
          headerLines: branding.receipt.headerLines,
          footerLines: branding.receipt.footerLines,
          paymentDetails: branding.receipt.paymentDetails,
        }),
      );
      escPosBase64 = buffer.toString('base64');
    }
    return {
      ok: true,
      error: null,
      invoice: result.invoice,
      escPosBase64,
    };
  } catch (error) {
    if (error instanceof FinalizeRefusal)
      return { ok: false, error: error.message, invoice: null, escPosBase64: null };
    if (error instanceof IllegalTransitionError)
      return { ok: false, error: error.message, invoice: null, escPosBase64: null };
    throw error;
  }
}
