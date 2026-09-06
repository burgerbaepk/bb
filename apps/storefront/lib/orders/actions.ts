'use server';

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  dbWrite,
  itemVariants,
  menuItems,
  nextOrderNoFrom,
  orderLines,
  orders,
  qrTokens,
  readMaxOrderNo,
  tableSessions,
  tables,
  withOrderNoRetry,
  writeAudit,
} from '@natech/db';
import { paisa, qtyToString } from '@natech/domain';
import { CartSchema } from '@natech/contracts';
import { getRealtime, WEB_ORDERS_CHANNEL } from '@natech/realtime';
import { currentCustomerSession } from '../auth/session';
import { readBusinessDayConfig, computeBusinessDate } from '../businessDate';

/**
 * Place a web order — BUILD-PLAN.md §13.4, §5.6, §2 R1/R2/R4/R6/R7;
 * docs/runfiles/M14-storefront.md §3.
 *
 * The one security-critical decision in this milestone: every price is
 * re-resolved here from live `menu_items`/`item_variants`, never taken from
 * the cart the client posted. The cart supplies only `itemId`/`variantId`/
 * `qty`/`note` — an unauthenticated write path that priced from its own
 * request body would let a customer place a fully-loaded order at whatever
 * total they cared to send.
 *
 * A valid QR token still binds an order to its table. Direct storefront orders
 * have no token and enter the web-order inbox as take-away orders instead, so
 * the public menu can be used without first scanning a code. A supplied but
 * retired/invalid token is still refused rather than silently losing a table
 * assignment the customer believed they had made.
 *
 * The order lands `PLACED` — §13.4's "never auto-accept" gate — and
 * `lib/webOrders/actions.ts` in `apps/pos` is what moves it to `SERVED` on
 * accept.
 */
const PlaceOrderInputSchema = z.object({ cart: CartSchema });

export type PlaceOrderResult =
  { readonly ok: true; readonly publicId: string } | { readonly ok: false; readonly error: string };

export async function placeOrderAction(input: unknown): Promise<PlaceOrderResult> {
  const parsed = PlaceOrderInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check your order.' };
  }
  const { cart } = parsed.data;

  if (cart.lines.length === 0) {
    return { ok: false, error: 'Your cart is empty.' };
  }

  const session = await currentCustomerSession();
  if (session === null) {
    return { ok: false, error: 'Verify your email before placing an order.' };
  }

  const tableToken = cart.tableToken;

  const db = dbWrite();

  const attempt = () =>
    db.transaction(async (tx) => {
      const tableRows =
        tableToken === null
          ? []
          : await tx
              .select({ id: tables.id })
              .from(tables)
              .innerJoin(qrTokens, eq(qrTokens.tableId, tables.id))
              .where(
                and(
                  eq(qrTokens.token, tableToken),
                  eq(qrTokens.isActive, true),
                  isNull(qrTokens.deletedAt),
                  isNull(tables.deletedAt),
                ),
              );
      const table = tableRows[0] ?? null;
      if (tableToken !== null && table === null) {
        throw new PlaceOrderRefusal('That table is no longer available. Ask staff for a new code.');
      }

      const itemIds = [...new Set(cart.lines.map((line) => line.itemId))];
      const menuRows = await tx
        .select({
          id: menuItems.id,
          name: menuItems.name,
          nameUr: menuItems.nameUr,
          basePrice: menuItems.basePrice,
          taxClassId: menuItems.taxClassId,
          isActive: menuItems.isActive,
        })
        .from(menuItems)
        .where(and(inArray(menuItems.id, itemIds), isNull(menuItems.deletedAt)));
      const menuById = new Map(menuRows.map((row) => [row.id, row]));

      const variantIds = cart.lines
        .map((line) => line.variantId)
        .filter((id): id is string => id !== null);
      const variantRows =
        variantIds.length === 0
          ? []
          : await tx
              .select({
                id: itemVariants.id,
                name: itemVariants.name,
                nameUr: itemVariants.nameUr,
                priceDelta: itemVariants.priceDelta,
              })
              .from(itemVariants)
              .where(and(inArray(itemVariants.id, variantIds), isNull(itemVariants.deletedAt)));
      const variantById = new Map(variantRows.map((row) => [row.id, row]));

      const resolvedLines = cart.lines.map((line) => {
        const item = menuById.get(line.itemId);
        if (item === undefined || !item.isActive) {
          throw new PlaceOrderRefusal(`${line.name} is no longer available.`);
        }
        const variant = line.variantId === null ? null : (variantById.get(line.variantId) ?? null);
        return {
          menuItemId: item.id,
          variantId: variant?.id ?? null,
          nameSnapshot: variant === null ? item.name : `${item.name} — ${variant.name}`,
          nameUrSnapshot: variant?.nameUr ?? item.nameUr,
          qty: line.qty,
          unitPrice: paisa(item.basePrice + (variant?.priceDelta ?? 0n)),
          taxClassId: item.taxClassId,
          note: line.note,
        };
      });

      const config = await readBusinessDayConfig(tx);
      const now = new Date();
      const businessDate = computeBusinessDate(now, config);
      const maxNo = await readMaxOrderNo(tx, businessDate);
      const orderNo = nextOrderNoFrom(maxNo);
      const publicId = crypto.randomUUID();

      const sessionRows =
        table === null
          ? []
          : await tx
              .select({ id: tableSessions.id })
              .from(tableSessions)
              .where(and(eq(tableSessions.tableId, table.id), isNull(tableSessions.closedAt)));

      const [insertedOrder] = await tx
        .insert(orders)
        .values({
          orderNo,
          channel: 'WEB',
          type: table === null ? 'TAKE_AWAY' : 'DINE_IN',
          tableId: table?.id ?? null,
          tableSessionId: sessionRows[0]?.id ?? null,
          customerId: session.customerId,
          status: 'PLACED',
          note: cart.note,
          clientOrderUuid: publicId,
          businessDate,
          serviceStartedAt: now,
        })
        .returning({ id: orders.id });
      if (insertedOrder === undefined) throw new PlaceOrderRefusal('The order could not be saved.');

      for (const line of resolvedLines) {
        await tx.insert(orderLines).values({
          orderId: insertedOrder.id,
          menuItemId: line.menuItemId,
          variantId: line.variantId,
          nameSnapshot: line.nameSnapshot,
          nameUrSnapshot: line.nameUrSnapshot,
          qty: qtyToString(line.qty),
          unitPrice: line.unitPrice,
          taxClassId: line.taxClassId,
          note: line.note,
        });
      }

      await writeAudit(
        tx,
        {},
        {
          entity: 'orders',
          entityId: insertedOrder.id,
          action: 'WEB_ORDER_PLACED',
          after: { orderNo, customerId: session.customerId, lineCount: resolvedLines.length },
        },
      );

      return publicId;
    });

  let publicId: string;
  try {
    publicId = await withOrderNoRetry(attempt);
  } catch (error) {
    if (error instanceof PlaceOrderRefusal) return { ok: false, error: error.message };
    throw error;
  }

  // The order is already committed at this point. Realtime is only a prompt
  // for open inbox screens to refresh; an unavailable Redis service must not
  // turn a successful order into an apparent failure and invite duplicates.
  try {
    await getRealtime().channel(WEB_ORDERS_CHANNEL).emit('webOrders.changed', {});
  } catch (error) {
    console.error('Web order saved, but the realtime notification failed.', error);
  }

  return { ok: true, publicId };
}

class PlaceOrderRefusal extends Error {}
