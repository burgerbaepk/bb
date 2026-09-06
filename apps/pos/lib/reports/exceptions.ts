import 'server-only';
import { and, between, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import {
  auditLog,
  dbRead,
  invoices,
  orderLines,
  orders,
  payments,
  tables,
  users,
} from '@natech/db';
import { extend, paisa, sum, parseQty, ZERO, type Paisa } from '@natech/domain';
import type { DateRange, ExceptionRow } from '@natech/contracts';

/**
 * Exceptions — BUILD-PLAN.md §17; docs/runfiles/M13-reporting.md §3.
 *
 * Two of the four `ExceptionKind`s have real, already-written data behind
 * them; `DISCOUNT` and `PRICE_OVERRIDE` do not (nothing in this codebase
 * persists either — see the runfile) and this function simply never produces
 * one. `DECLINED_CARD` reuses `payments.attemptStatus`, a structured column
 * an earlier milestone already wrote, rather than parsing `audit_log`'s
 * `before`/`after` jsonb where a real column already says the same thing.
 * `VOID_ORDER` is the one exception with no dedicated column for its own
 * event, so it is the one kind read from `audit_log`.
 */

function reasonFromAuditAfter(after: unknown): string | null {
  if (typeof after !== 'object' || after === null) return null;
  const value = (after as Record<string, unknown>)['reason'];
  return typeof value === 'string' ? value : null;
}

async function readVoidOrderExceptions(range: DateRange): Promise<ExceptionRow[]> {
  const rows = await dbRead()
    .select({
      id: auditLog.id,
      at: auditLog.at,
      after: auditLog.after,
      orderId: auditLog.entityId,
      actorName: users.displayName,
      businessDate: orders.businessDate,
      tableId: orders.tableId,
      orderNo: orders.orderNo,
    })
    .from(auditLog)
    .innerJoin(orders, eq(auditLog.entityId, orders.id))
    .leftJoin(users, eq(auditLog.actorId, users.id))
    .where(
      and(
        eq(auditLog.entity, 'orders'),
        eq(auditLog.action, 'ORDER_VOIDED'),
        isNull(orders.deletedAt),
      ),
    );

  const inRange = rows.filter(
    (row): row is typeof row & { orderId: string; businessDate: string } =>
      row.orderId !== null &&
      row.businessDate !== null &&
      row.businessDate >= range.fromBusinessDate &&
      row.businessDate <= range.toBusinessDate,
  );
  if (inRange.length === 0) return [];

  const lineRows = await dbRead()
    .select({
      orderId: orderLines.orderId,
      unitPrice: orderLines.unitPrice,
      qty: orderLines.qty,
      lineDiscount: orderLines.lineDiscount,
    })
    .from(orderLines)
    .where(
      and(
        inArray(
          orderLines.orderId,
          inRange.map((row) => row.orderId),
        ),
        isNull(orderLines.deletedAt),
      ),
    );
  const amountByOrder = new Map<string, Paisa[]>();
  for (const line of lineRows) {
    const amount = paisa(extend(paisa(line.unitPrice), parseQty(line.qty)) - line.lineDiscount);
    const existing = amountByOrder.get(line.orderId);
    if (existing === undefined) amountByOrder.set(line.orderId, [amount]);
    else existing.push(amount);
  }

  const tableCodeById = await tableCodesFor(inRange.map((row) => row.tableId));

  return inRange.map((row) => ({
    id: row.id,
    kind: 'VOID_ORDER' as const,
    at: row.at,
    businessDate: row.businessDate,
    actorName: row.actorName ?? 'Unknown',
    reference: `Order #${row.orderNo}`,
    tableCode: row.tableId === null ? null : (tableCodeById.get(row.tableId) ?? null),
    amount: sum(amountByOrder.get(row.orderId) ?? [ZERO]),
    reason: reasonFromAuditAfter(row.after),
    supervisorName: null,
  }));
}

async function readDeclinedCardExceptions(range: DateRange): Promise<ExceptionRow[]> {
  const rows = await dbRead()
    .select({
      id: payments.id,
      at: payments.createdAt,
      amount: payments.amount,
      declinedReason: payments.declinedReason,
      businessDate: invoices.businessDate,
      localNo: invoices.localNo,
      finalizedBy: invoices.finalizedBy,
      orderId: invoices.orderId,
    })
    .from(payments)
    .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
    .where(
      and(
        eq(payments.attemptStatus, 'DECLINED'),
        isNull(payments.deletedAt),
        isNull(invoices.deletedAt),
        between(invoices.businessDate, range.fromBusinessDate, range.toBusinessDate),
      ),
    );
  if (rows.length === 0) return [];

  const orderIds = [...new Set(rows.map((row) => row.orderId))];
  const orderRows = await dbRead()
    .select({ id: orders.id, tableId: orders.tableId })
    .from(orders)
    .where(and(inArray(orders.id, orderIds), isNull(orders.deletedAt)));
  const tableIdByOrder = new Map(orderRows.map((row) => [row.id, row.tableId]));

  const actorIds = [
    ...new Set(rows.map((row) => row.finalizedBy).filter((id): id is string => id !== null)),
  ];
  const actorRows =
    actorIds.length === 0
      ? []
      : await dbRead()
          .select({ id: users.id, displayName: users.displayName })
          .from(users)
          .where(inArray(users.id, actorIds));
  const actorNameById = new Map(actorRows.map((row) => [row.id, row.displayName]));

  const tableIds = [...tableIdByOrder.values()];
  const tableCodeById = await tableCodesFor(tableIds);

  return rows.map((row) => {
    const tableId = tableIdByOrder.get(row.orderId) ?? null;
    return {
      id: row.id,
      kind: 'DECLINED_CARD' as const,
      at: row.at,
      businessDate: row.businessDate,
      actorName:
        row.finalizedBy === null ? 'Unknown' : (actorNameById.get(row.finalizedBy) ?? 'Unknown'),
      reference: row.localNo,
      tableCode: tableId === null ? null : (tableCodeById.get(tableId) ?? null),
      amount: paisa(row.amount),
      reason: row.declinedReason,
      supervisorName: null,
    };
  });
}

/**
 * A bill was shown or printed and the sale never became an invoice — ADR 0027.
 *
 * This is the one exception kind that reports an *absence*. The others all
 * describe something that happened; this one describes a sale that was quoted
 * to a customer and then stopped existing, which is what taking the cash and
 * pocketing it looks like from the inside of the database.
 *
 * The join is deliberately `leftJoin` + "no invoice row": an order that was
 * finalized is not an exception no matter how many times its bill was read
 * out, and an order that was explicitly voided is somebody's recorded decision
 * and already reported under `VOID_ORDER`. What is left is the interesting
 * set — booked, quoted, and then silently abandoned.
 *
 * `ORDER_BILL_PRINTED` outranks `ORDER_BILL_VIEWED` for the same order: paper
 * in a customer's hand is the stronger signal, and reporting both rows for one
 * order would double-count the amount in the summary. The rows arrive newest
 * first and the first one per order wins.
 */
async function readBillNotFinalizedExceptions(range: DateRange): Promise<ExceptionRow[]> {
  const rows = await dbRead()
    .select({
      id: auditLog.id,
      at: auditLog.at,
      action: auditLog.action,
      after: auditLog.after,
      orderId: auditLog.entityId,
      actorName: users.displayName,
      businessDate: orders.businessDate,
      tableId: orders.tableId,
      orderNo: orders.orderNo,
      status: orders.status,
      invoiceId: invoices.id,
    })
    .from(auditLog)
    .innerJoin(orders, eq(auditLog.entityId, orders.id))
    .leftJoin(users, eq(auditLog.actorId, users.id))
    .leftJoin(invoices, and(eq(invoices.orderId, orders.id), isNull(invoices.deletedAt)))
    .where(
      and(
        eq(auditLog.entity, 'orders'),
        or(eq(auditLog.action, 'ORDER_BILL_PRINTED'), eq(auditLog.action, 'ORDER_BILL_VIEWED')),
        isNull(orders.deletedAt),
        isNull(invoices.id),
        ne(orders.status, 'VOIDED'),
      ),
    )
    .orderBy(desc(auditLog.at));

  const inRange = rows.filter(
    (row): row is typeof row & { orderId: string; businessDate: string } =>
      row.orderId !== null &&
      row.businessDate !== null &&
      row.businessDate >= range.fromBusinessDate &&
      row.businessDate <= range.toBusinessDate,
  );
  if (inRange.length === 0) return [];

  // One row per order — printed beats viewed, newest beats older.
  const bestByOrder = new Map<string, (typeof inRange)[number]>();
  for (const row of inRange) {
    const held = bestByOrder.get(row.orderId);
    if (held === undefined) {
      bestByOrder.set(row.orderId, row);
      continue;
    }
    if (held.action !== 'ORDER_BILL_PRINTED' && row.action === 'ORDER_BILL_PRINTED') {
      bestByOrder.set(row.orderId, row);
    }
  }
  const chosen = [...bestByOrder.values()];

  const tableCodeById = await tableCodesFor(chosen.map((row) => row.tableId));

  return chosen.map((row) => ({
    id: row.id,
    kind: 'BILL_NOT_FINALIZED' as const,
    at: row.at,
    businessDate: row.businessDate,
    actorName: row.actorName ?? 'Unknown',
    reference: `Order #${row.orderNo}`,
    tableCode: row.tableId === null ? null : (tableCodeById.get(row.tableId) ?? null),
    // The figure the customer was actually quoted, off the audit row, not a
    // recomputation — a menu edit since then must not move it (§5.6).
    amount: quotedTotal(row.after),
    reason:
      row.action === 'ORDER_BILL_PRINTED'
        ? 'Bill printed, never finalized'
        : 'Bill shown, never finalized',
    supervisorName: null,
  }));
}

/** The `grandTotal` the bill-print audit row recorded, as paisa. */
function quotedTotal(after: unknown): Paisa {
  if (typeof after !== 'object' || after === null) return ZERO;
  const value = (after as Record<string, unknown>)['grandTotal'];
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return paisa(BigInt(value));
  if (typeof value === 'number' && Number.isInteger(value)) return paisa(BigInt(value));
  return ZERO;
}

async function tableCodesFor(tableIds: readonly (string | null)[]): Promise<Map<string, string>> {
  const ids = [...new Set(tableIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();
  const rows = await dbRead()
    .select({ id: tables.id, code: tables.code })
    .from(tables)
    .where(inArray(tables.id, ids));
  return new Map(rows.map((row) => [row.id, row.code]));
}

export async function readExceptions(range: DateRange): Promise<ExceptionRow[]> {
  const [voidOrders, declined, unfinalizedBills] = await Promise.all([
    readVoidOrderExceptions(range),
    readDeclinedCardExceptions(range),
    readBillNotFinalizedExceptions(range),
  ]);

  return [...voidOrders, ...declined, ...unfinalizedBills].sort(
    (a, b) => b.at.getTime() - a.at.getTime(),
  );
}
