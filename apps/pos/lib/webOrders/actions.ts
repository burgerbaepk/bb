'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { dbWrite, orderLines, orders, writeAudit } from '@natech/db';
import { IllegalTransitionError, orderMachine } from '@natech/domain';
import type { OrderStatus } from '@natech/domain';
import { FLOOR_CHANNEL, getRealtime, WEB_ORDERS_CHANNEL } from '@natech/realtime';
import {
  Forbidden,
  Locked,
  NotSignedIn,
  assertPermission,
  requestContext,
  requireTillStaff,
} from '../auth/session';
import type { TillIdentity } from '../auth/session';
import { readPendingWebOrders, type PendingWebOrder } from './queries';

/**
 * Accept and reject a web order — BUILD-PLAN.md §13.4, §2 R2/R4/R6/R7;
 * docs/runfiles/M14-storefront.md §3.
 *
 * Accept reuses `order.send` (this **is** `placeOrderAction`'s own
 * `PLACED → SERVED` edge, just for an order that arrived by QR rather than
 * by cart); reject reuses `order.void` (the identical `PLACED → VOIDED`
 * transition `voidOrderAction` already performs, with the same
 * reason-on-the-line shape) — neither is a new permission. Neither takes a
 * supervisor PIN: `voidOrderAction`'s own PIN step-up exists for reversing a
 * decision already acted on (a customer told a total, a payment taken); a
 * web order still `PLACED` has had neither happen yet, and
 * `WebOrderInbox`'s own M06 markup never had a PIN field to begin with —
 * this does not add one.
 */
class WebOrderRefusal extends Error {}

const AcceptWebOrderInputSchema = z.object({ orderId: z.uuid() });

export interface WebOrderActionResult {
  readonly ok: boolean;
  readonly error: string | null;
}

export async function acceptWebOrderAction(input: unknown): Promise<WebOrderActionResult> {
  const parsed = AcceptWebOrderInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the order.' };
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

  try {
    await db.transaction(async (tx) => {
      const orderRows = await tx
        .select({ id: orders.id, status: orders.status })
        .from(orders)
        .where(
          and(
            eq(orders.id, parsed.data.orderId),
            eq(orders.channel, 'WEB'),
            isNull(orders.deletedAt),
          ),
        );
      const order = orderRows[0];
      if (order === undefined) throw new WebOrderRefusal('That order no longer exists.');

      const fromStatus = order.status as OrderStatus;
      orderMachine.assert(fromStatus, 'SERVED');

      const now = new Date();
      await tx
        .update(orders)
        .set({ status: 'SERVED', updatedAt: now })
        .where(eq(orders.id, order.id));

      await writeAudit(
        tx,
        { actorId: viewer.id },
        {
          entity: 'orders',
          entityId: order.id,
          action: 'WEB_ORDER_ACCEPTED',
          before: { status: fromStatus },
          after: { status: 'SERVED' },
        },
      );
    });
  } catch (error) {
    if (error instanceof WebOrderRefusal) return { ok: false, error: error.message };
    if (error instanceof IllegalTransitionError) return { ok: false, error: error.message };
    throw error;
  }

  await getRealtime().channel(FLOOR_CHANNEL).emit('floor.changed', {});
  await getRealtime().channel(WEB_ORDERS_CHANNEL).emit('webOrders.changed', {});
  revalidatePath('/web-orders');
  revalidatePath('/floor');

  return { ok: true, error: null };
}

const RejectWebOrderInputSchema = z.object({
  orderId: z.uuid(),
  reason: z.string().trim().min(1, 'A rejection needs a reason.'),
});

export async function rejectWebOrderAction(input: unknown): Promise<WebOrderActionResult> {
  const parsed = RejectWebOrderInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the reason.' };
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
        .where(
          and(
            eq(orders.id, parsed.data.orderId),
            eq(orders.channel, 'WEB'),
            isNull(orders.deletedAt),
          ),
        );
      const order = orderRows[0];
      if (order === undefined) throw new WebOrderRefusal('That order no longer exists.');

      const fromStatus = order.status as OrderStatus;
      orderMachine.assert(fromStatus, 'VOIDED');

      await tx
        .update(orders)
        .set({ status: 'VOIDED', updatedAt: new Date() })
        .where(eq(orders.id, order.id));

      await tx
        .update(orderLines)
        .set({ voidReason: parsed.data.reason, updatedAt: new Date() })
        .where(
          and(
            eq(orderLines.orderId, order.id),
            isNull(orderLines.deletedAt),
            isNull(orderLines.voidReason),
          ),
        );

      await writeAudit(
        tx,
        { actorId: viewer.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
        {
          entity: 'orders',
          entityId: order.id,
          action: 'WEB_ORDER_REJECTED',
          before: { status: fromStatus },
          after: { status: 'VOIDED', reason: parsed.data.reason },
        },
      );
    });
  } catch (error) {
    if (error instanceof WebOrderRefusal) return { ok: false, error: error.message };
    if (error instanceof IllegalTransitionError) return { ok: false, error: error.message };
    throw error;
  }

  await getRealtime().channel(WEB_ORDERS_CHANNEL).emit('webOrders.changed', {});
  revalidatePath('/web-orders');

  return { ok: true, error: null };
}

/**
 * The pending-order poll behind the shell's audible alert — §13.4, §16.
 *
 * §16 wants a three-second poll as a correctness backstop on every consumer,
 * not only a live stream: an `EventSource` that drops while a tablet is asleep
 * or a serverless function recycles reconnects silently, and the one event it
 * missed was the one that mattered. The alert is the consumer that must not
 * miss it, so it polls as well as subscribing.
 *
 * Gated on `requireTillStaff` like every other action here, not on the
 * terminal binding alone: it returns order numbers and table codes.
 */
export interface PendingWebOrdersResult {
  readonly ok: boolean;
  readonly orders: readonly PendingWebOrder[];
  readonly error: string | null;
}

export async function loadPendingWebOrdersAction(): Promise<PendingWebOrdersResult> {
  try {
    await requireTillStaff();
  } catch (error) {
    if (error instanceof Locked || error instanceof NotSignedIn) {
      return { ok: false, orders: [], error: error.message };
    }
    throw error;
  }

  return { ok: true, orders: await readPendingWebOrders(), error: null };
}
