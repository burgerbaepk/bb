'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { dbWrite, expenses, orderLines, orders, writeAudit } from '@natech/db';
import { IllegalTransitionError, linesSubtotal, orderMachine, priceLines } from '@natech/domain';
import {
  Forbidden,
  Locked,
  NotSignedIn,
  assertPermission,
  requestContext,
  requireTillStaff,
} from '../auth/session';
import { resolveCategory } from '../expenses/categories';
import { readCurrentBusinessDate } from '../outlet/queries';
import { loadPriceableOrder } from './pricing';
import { releaseTableIfIdle } from './releaseTable';
import { currentOrderStatus, type PersistedOrderStatus } from './status';

const InfluencerMealInputSchema = z.object({
  orderId: z.uuid(),
  name: z.string().trim().min(2, 'Enter the influencer’s name.').max(120),
});
export type InfluencerMealInput = z.infer<typeof InfluencerMealInputSchema>;

export interface InfluencerMealResult {
  readonly ok: boolean;
  readonly error: string | null;
}

/** ADR 0038 — the category every influencer meal is booked under. */
const INFLUENCER_CATEGORY = 'Influencers';
const INFLUENCER_VOID_REASON = 'Influencer meal';

class Refusal extends Error {}

/**
 * Close an order as an influencer meal — ADR 0038.
 *
 * Food given to an influencer for marketing is paid for by nobody, so it is
 * not a sale: no invoice is written, nothing is sent to PRA/FBR, and the
 * order closes `VOIDED` with every line voided as `Influencer meal` — the one
 * signal `lib/reports/sales.ts` already uses to keep a line out of sales. In
 * the same transaction an `expenses` row books its menu value (ex tax, before
 * any discount: R9 puts tax only on an invoice, and there is none) under
 * "Influencers", linked to the order. The link is what tells this void from
 * an ordinary one, and it is why the expense cannot be deleted afterwards.
 *
 * `discount.apply`, not `order.void`: giving food away is a 100% discount,
 * and a cashier who could do it could take a customer's cash and book the
 * meal as marketing. A manager or owner must be signed in at the till.
 *
 * The audit action is `ORDER_INFLUENCER_MEAL`, not `ORDER_VOIDED`, so the
 * exceptions report's void count and the daily email's void flags count
 * only real voids; the owner sees these on the expense ledger instead.
 */
export async function recordInfluencerMealAction(
  input: InfluencerMealInput,
): Promise<InfluencerMealResult> {
  const parsed = InfluencerMealInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the request.' };
  }

  let viewer;
  try {
    ({ viewer } = await requireTillStaff());
    assertPermission(viewer, 'discount.apply');
  } catch (error) {
    if (error instanceof Locked || error instanceof NotSignedIn) {
      return { ok: false, error: error.message };
    }
    if (error instanceof Forbidden) {
      return { ok: false, error: 'Only a manager or the owner can record an influencer meal.' };
    }
    throw error;
  }

  const context = await requestContext();
  const audit = { actorId: viewer.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined };
  const today = await readCurrentBusinessDate();
  const { orderId, name } = parsed.data;

  try {
    await dbWrite().transaction(async (tx) => {
      // Locked so a finalize on another terminal cannot invoice the same
      // order while this one is giving it away.
      const existing = await tx
        .select({
          status: orders.status,
          orderNo: orders.orderNo,
          tableId: orders.tableId,
          businessDate: orders.businessDate,
        })
        .from(orders)
        .where(and(eq(orders.id, orderId), isNull(orders.deletedAt)))
        .for('update')
        .then((rows) => rows[0]);
      if (existing === undefined) throw new Refusal('That order no longer exists.');

      const persistedStatus = existing.status as PersistedOrderStatus;
      // R5 — a finalized order has no edge to VOIDED; its invoice stands.
      orderMachine.assert(currentOrderStatus(persistedStatus), 'VOIDED');

      const priceable = await loadPriceableOrder(tx, orderId);
      const amount = linesSubtotal(priceLines(priceable?.domainLines ?? []));
      if (amount <= 0n) throw new Refusal('There is nothing on this order to record.');

      await tx
        .update(orders)
        .set({ status: 'VOIDED', updatedAt: new Date() })
        .where(eq(orders.id, orderId));
      await tx
        .update(orderLines)
        .set({ voidReason: INFLUENCER_VOID_REASON, updatedAt: new Date() })
        .where(
          and(
            eq(orderLines.orderId, orderId),
            isNull(orderLines.deletedAt),
            isNull(orderLines.voidReason),
          ),
        );

      const category = await resolveCategory(tx, INFLUENCER_CATEGORY);
      const created = await tx
        .insert(expenses)
        .values({
          incurredOn: existing.businessDate ?? today,
          category,
          vendor: name,
          description: `Influencer meal — order #${existing.orderNo}`,
          amount,
          paymentMethod: null,
          reference: `Order #${existing.orderNo}`,
          orderId,
          createdBy: viewer.id,
        })
        .returning({ id: expenses.id })
        .then((rows) => rows[0]);
      if (created === undefined) throw new Error('Creating the expense returned no row.');

      await writeAudit(tx, audit, {
        entity: 'orders',
        entityId: orderId,
        action: 'ORDER_INFLUENCER_MEAL',
        before: { status: persistedStatus },
        after: { status: 'VOIDED', influencer: name, amount: amount.toString() },
      });
      await writeAudit(tx, audit, {
        entity: 'expenses',
        entityId: created.id,
        action: 'EXPENSE_CREATED',
        after: { incurredOn: existing.businessDate ?? today, category, amount: amount.toString() },
      });

      if (existing.tableId !== null) await releaseTableIfIdle(tx, existing.tableId, audit);
    });
  } catch (error) {
    if (error instanceof Refusal || error instanceof IllegalTransitionError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  after(() => {
    revalidatePath('/floor');
    revalidatePath('/orders');
    revalidatePath('/admin');
    revalidatePath('/admin/expenses');
  });
  return { ok: true, error: null };
}
