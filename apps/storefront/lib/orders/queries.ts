import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { dbRead, orderLines, orders, tables } from '@natech/db';
import { extend, paisa, parseQty, sum, type Paisa } from '@natech/domain';
import type { PublicOrderStatus } from '@natech/contracts';

/** `4` reads as `4×`, `0.5` as `0.5×` — trailing zeros trimmed, unlike the DB's fixed three-decimal wire form. */
function formatQty(qty: bigint): string {
  const units = qty / 1000n;
  const thousandths = qty % 1000n;
  if (thousandths === 0n) return units.toString();
  return `${units}.${thousandths.toString().padStart(3, '0').replace(/0+$/, '')}`;
}

/**
 * Live order status — BUILD-PLAN.md §13.1, §13.4, §16, §6.9;
 * docs/runfiles/M14-storefront.md §3.
 *
 * `decision`/`rejectReason` are derived, never stored: `status==='VOIDED'`
 * is a rejection, `status==='PLACED'` is still pending, anything past that
 * is accepted — the reason lives on the order's own lines' `voidReason`,
 * the same column `voidOrderAction` already writes. `acceptedAt` reuses
 * `orders.updatedAt` — ADR 0018 removed the dedicated kitchen-acceptance
 * timestamp along with the kitchen display product, and `updatedAt` is set
 * by the same `acceptWebOrderAction` write that used to also set it, so it
 * remains null exactly while the order is still `PLACED`.
 *
 * Only ever resolves a `channel = 'WEB'` order — a POS order's own
 * `clientOrderUuid` (its offline-replay key, §8) must never be reachable
 * through this public, unauthenticated lookup.
 */
export async function publicOrderStatus(publicId: string): Promise<PublicOrderStatus | null> {
  const orderRows = await dbRead()
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      status: orders.status,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
      tableCode: tables.code,
    })
    .from(orders)
    .leftJoin(tables, eq(orders.tableId, tables.id))
    .where(
      and(
        eq(orders.clientOrderUuid, publicId),
        eq(orders.channel, 'WEB'),
        isNull(orders.deletedAt),
      ),
    );

  const order = orderRows[0];
  if (order === undefined) return null;

  const lineRows = await dbRead()
    .select({
      nameSnapshot: orderLines.nameSnapshot,
      nameUrSnapshot: orderLines.nameUrSnapshot,
      qty: orderLines.qty,
      unitPrice: orderLines.unitPrice,
      voidReason: orderLines.voidReason,
    })
    .from(orderLines)
    .where(and(eq(orderLines.orderId, order.id), isNull(orderLines.deletedAt)));

  const lines = lineRows.map((line) => {
    const qty = parseQty(line.qty);
    return {
      name: line.nameSnapshot,
      nameUr: line.nameUrSnapshot,
      qtyLabel: `${formatQty(qty)}×`,
      lineTotalExTax: extend(paisa(line.unitPrice), qty),
    };
  });

  const subtotalExTax: Paisa = sum(lines.map((line) => line.lineTotalExTax));

  const rejectReason = lineRows.find((line) => line.voidReason !== null)?.voidReason ?? null;
  const decision: PublicOrderStatus['decision'] =
    order.status === 'VOIDED' ? 'REJECTED' : order.status === 'PLACED' ? 'PENDING' : 'ACCEPTED';

  return {
    publicId,
    orderNo: order.orderNo,
    status: order.status,
    decision,
    rejectReason,
    tableCode: order.tableCode,
    placedAt: order.createdAt,
    acceptedAt: decision === 'ACCEPTED' ? order.updatedAt : null,
    lines,
    subtotalExTax,
  };
}
