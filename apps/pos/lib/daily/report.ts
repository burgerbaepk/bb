import 'server-only';
import { and, eq, gte, inArray, isNull, lt } from 'drizzle-orm';
import {
  auditLog,
  dbRead,
  dbWrite,
  orderLines,
  orders,
  roles,
  userRoles,
  users,
  withIdempotency,
} from '@natech/db';
import { paisa, type Paisa } from '@natech/domain';
import { readOutletConfig } from '../outlet/queries';
import { readBrandConfig } from '../branding/queries';
import { computeBusinessDate } from '../orders/businessDateLogic';
import { readExceptions } from '../reports/exceptions';
import { readChannelMix, readItemSales, readPaymentMix, readSalesByDate } from '../reports/sales';
import { sendOwnerReport } from '../mail';
import { toEmailRgb } from './colour';
import {
  activitySummaryEmail,
  dailySalesEmail,
  type EmailOutlet,
  type FlaggedVoid,
  type StaffActivity,
} from './email';

/**
 * The owner's daily emails, gathered and sent — ADR 0029.
 *
 * Every figure comes from a reader that already backs a screen: sales from
 * `lib/reports/sales.ts`, exceptions from `lib/reports/exceptions.ts`, and
 * activity from `audit_log` exactly as `/admin/activity` reads it. So the
 * email and the back office cannot disagree about a day (R16) — the email is
 * one more render of the same rows, not a second calculation.
 */

const FLAG_ACTIONS = ['ORDER_VOIDED_AFTER_BILL_PRINTED', 'ORDER_VOIDED_AFTER_BILL_VIEWED'] as const;
const BILL_ACTIONS = ['ORDER_BILL_PRINTED', 'ORDER_BILL_VIEWED'] as const;
const VOID_ACTIONS = ['ORDER_VOIDED', 'ORDER_LINE_VOIDED'] as const;
const DISCOUNT_ACTIONS = ['ORDER_DISCOUNT_SET'] as const;

const NOTABLE_LABEL: Record<string, string> = {
  ORDER_VOIDED: 'Order voided',
  ORDER_LINE_VOIDED: 'Item voided',
  ORDER_DISCOUNT_SET: 'Discount applied',
};

/** A decimal paisa string off an audit row's `after`, or null. */
function paisaField(after: unknown, key: string): Paisa | null {
  if (typeof after !== 'object' || after === null) return null;
  const value = (after as Record<string, unknown>)[key];
  return typeof value === 'string' && /^-?\d+$/.test(value) ? paisa(BigInt(value)) : null;
}

function field(after: unknown, key: string): unknown {
  return typeof after === 'object' && after !== null
    ? (after as Record<string, unknown>)[key]
    : undefined;
}

/**
 * The absolute URL an email client can fetch the logo from. The branding row
 * stores a site-relative path for the POS's own pages, which means nothing in
 * an inbox, so it is resolved against the POS's public origin. Without one the
 * email sets the trading name as a wordmark rather than show a broken image.
 */
function absoluteLogo(path: string): string | null {
  if (path.trim() === '') return null;
  if (/^https?:\/\//.test(path)) return path;
  const origin = process.env['NEXT_PUBLIC_POS_URL'] ?? process.env['AUTH_URL'];
  if (origin === undefined || origin === '') return null;
  return new URL(path, origin).toString();
}

async function readEmailOutlet(): Promise<EmailOutlet | null> {
  const [outlet, brand] = await Promise.all([readOutletConfig(), readBrandConfig()]);
  if (outlet === null) return null;
  return {
    tradingName: outlet.tradingName,
    legalName: outlet.legalName,
    address: outlet.address,
    city: outlet.city,
    phone: outlet.phone,
    email: outlet.email ?? null,
    ntn: outlet.ntn,
    logoUrl: absoluteLogo(brand.identity.logoLight),
    brandColour: toEmailRgb(brand.theme.primary, 'rgb(17, 24, 39)'),
    brandInk: toEmailRgb(brand.theme.accent, 'rgb(17, 24, 39)'),
    timezone: outlet.timezone,
  };
}

/**
 * The audit rows that fall on one business day. The window is read generously
 * (a day either side, in UTC) and narrowed with the same `computeBusinessDate`
 * every order uses, so the cutoff and the timezone are applied exactly once
 * and exactly the same way — a row at 02:00 after a late close belongs to the
 * night before, here as on the invoice.
 */
async function readDayAudit(businessDate: string, timezone: string, cutoff: string) {
  const start = new Date(`${businessDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 1);
  const end = new Date(`${businessDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 2);

  const rows = await dbRead()
    .select({
      at: auditLog.at,
      action: auditLog.action,
      entity: auditLog.entity,
      entityId: auditLog.entityId,
      after: auditLog.after,
      actorId: auditLog.actorId,
      actorName: users.displayName,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.actorId, users.id))
    .where(and(gte(auditLog.at, start), lt(auditLog.at, end), isNull(auditLog.deletedAt)));

  return rows.filter((row) => computeBusinessDate(row.at, { timezone, cutoff }) === businessDate);
}

async function readRoleNames(userIds: readonly string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await dbRead()
    .select({ userId: userRoles.userId, role: roles.key })
    .from(userRoles)
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.deletedAt)))
    .where(and(inArray(userRoles.userId, [...userIds]), isNull(userRoles.deletedAt)));
  const byUser = new Map<string, string>();
  for (const row of rows) if (!byUser.has(row.userId)) byUser.set(row.userId, row.role);
  return byUser;
}

async function readUserNames(userIds: readonly string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await dbRead()
    .select({ id: users.id, name: users.displayName })
    .from(users)
    .where(inArray(users.id, [...userIds]));
  return new Map(rows.map((row) => [row.id, row.name]));
}

/**
 * Order numbers for audit rows that name an order or one of its lines. Void
 * and discount rows record the change, not the order number, so the email
 * looks it up rather than print a bare uuid an owner cannot act on.
 */
async function readOrderNos(
  rows: readonly { entity: string; entityId: string | null }[],
): Promise<Map<string, number>> {
  const orderIds = rows.flatMap((row) =>
    row.entity === 'orders' && row.entityId !== null ? [row.entityId] : [],
  );
  const lineIds = rows.flatMap((row) =>
    row.entity === 'order_lines' && row.entityId !== null ? [row.entityId] : [],
  );
  const [direct, viaLine] = await Promise.all([
    orderIds.length === 0
      ? []
      : dbRead()
          .select({ id: orders.id, orderNo: orders.orderNo })
          .from(orders)
          .where(inArray(orders.id, [...new Set(orderIds)])),
    lineIds.length === 0
      ? []
      : dbRead()
          .select({ id: orderLines.id, orderNo: orders.orderNo })
          .from(orderLines)
          .innerJoin(orders, eq(orders.id, orderLines.orderId))
          .where(inArray(orderLines.id, [...new Set(lineIds)])),
  ]);
  return new Map([...direct, ...viaLine].map((row) => [row.id, row.orderNo]));
}

/** Both emails for one business day, rendered but not sent. */
export async function buildDailyOwnerEmails(businessDate: string, cutoff: string) {
  const outlet = await readEmailOutlet();
  if (outlet === null) throw new Error('Outlet identity is incomplete; cannot address the report.');

  const range = { fromBusinessDate: businessDate, toBusinessDate: businessDate };
  const [salesByDate, paymentMix, channelMix, itemSales, exceptions, audit] = await Promise.all([
    readSalesByDate(range),
    readPaymentMix(range),
    readChannelMix(range),
    readItemSales(range),
    readExceptions(range),
    readDayAudit(businessDate, outlet.timezone, cutoff),
  ]);

  const flaggedRows = audit.filter((row) =>
    (FLAG_ACTIONS as readonly string[]).includes(row.action),
  );
  const billActorIds = flaggedRows.flatMap((row) => {
    const id = field(row.after, 'billActorId');
    return typeof id === 'string' ? [id] : [];
  });
  const actorIds = [
    ...new Set(audit.flatMap((row) => (row.actorId === null ? [] : [row.actorId]))),
  ];
  const [roleByUser, billActorNames] = await Promise.all([
    readRoleNames(actorIds),
    readUserNames([...new Set(billActorIds)]),
  ]);

  const flagged: FlaggedVoid[] = flaggedRows
    .map((row) => {
      const orderNo = field(row.after, 'orderNo');
      const billActor = field(row.after, 'billActorId');
      return {
        at: row.at,
        orderNo: typeof orderNo === 'number' ? orderNo : null,
        printed: row.action === 'ORDER_VOIDED_AFTER_BILL_PRINTED',
        quoted: paisaField(row.after, 'grandTotal'),
        voidedBy: row.actorName ?? 'Unknown',
        billBy:
          typeof billActor === 'string' ? (billActorNames.get(billActor) ?? 'Unknown') : 'Unknown',
      };
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const notableRows = audit.filter((row) =>
    ([...VOID_ACTIONS, ...DISCOUNT_ACTIONS] as readonly string[]).includes(row.action),
  );
  const orderNoById = await readOrderNos(notableRows);
  const notable = notableRows
    .map((row) => {
      const orderNo = row.entityId === null ? undefined : orderNoById.get(row.entityId);
      const reason = field(row.after, 'reason');
      return {
        at: row.at,
        label: NOTABLE_LABEL[row.action] ?? row.action,
        who: row.actorName ?? 'Unknown',
        reference: [
          typeof orderNo === 'number' ? `Order #${orderNo}` : null,
          typeof reason === 'string' && reason !== '' ? reason : null,
        ]
          .filter((part) => part !== null)
          .join(' · '),
        amount: paisaField(row.after, 'orderDiscount') ?? paisaField(row.after, 'grandTotal'),
      };
    })
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  const staffById = new Map<string, StaffActivity>();
  for (const row of audit) {
    if (row.actorId === null) continue;
    const held = staffById.get(row.actorId) ?? {
      name: row.actorName ?? 'Unknown',
      role: roleByUser.get(row.actorId) ?? null,
      actions: 0,
      billsPrinted: 0,
      voids: 0,
      discounts: 0,
    };
    staffById.set(row.actorId, {
      ...held,
      actions: held.actions + 1,
      billsPrinted:
        held.billsPrinted + ((BILL_ACTIONS as readonly string[]).includes(row.action) ? 1 : 0),
      voids: held.voids + ((VOID_ACTIONS as readonly string[]).includes(row.action) ? 1 : 0),
      discounts:
        held.discounts + ((DISCOUNT_ACTIONS as readonly string[]).includes(row.action) ? 1 : 0),
    });
  }
  const staff = [...staffById.values()].sort((a, b) => b.actions - a.actions);

  const generatedAt = new Date();
  return {
    sales: dailySalesEmail({
      outlet,
      businessDate,
      generatedAt,
      day: salesByDate.find((row) => row.businessDate === businessDate) ?? null,
      paymentMix,
      channelMix,
      topItems: itemSales,
      exceptions,
      flaggedCount: flagged.length,
    }),
    activity: activitySummaryEmail({
      outlet,
      businessDate,
      generatedAt,
      actionCount: audit.length,
      flagged,
      unfinalized: exceptions.filter((row) => row.kind === 'BILL_NOT_FINALIZED'),
      notable,
      staff,
    }),
  };
}

/**
 * Send both emails for `businessDate`, once.
 *
 * The idempotency key is claimed in the same transaction the sends run in, so
 * a second cron invocation for the same day (Vercel retries, or a manual
 * re-run) finds the key and sends nothing, while a failed send rolls the claim
 * back and leaves the day to the next attempt. `sendOwnerReport` answering
 * false (no Resend key configured) counts as "not sent" and also rolls back.
 */
export async function sendDailyOwnerEmails(
  businessDate: string,
  cutoff: string,
): Promise<{ readonly sent: boolean; readonly alreadySent: boolean }> {
  const emails = await buildDailyOwnerEmails(businessDate, cutoff);
  const outcome = await dbWrite()
    .transaction((tx) =>
      withIdempotency(tx, `daily-owner-report:${businessDate}`, 'daily-owner-report', async () => {
        const sales = await sendOwnerReport(
          emails.sales.subject,
          emails.sales.text,
          [],
          emails.sales.html,
        );
        const activity = await sendOwnerReport(
          emails.activity.subject,
          emails.activity.text,
          [],
          emails.activity.html,
        );
        if (!sales || !activity) throw new DailyReportNotSent();
        return { sentAt: new Date().toISOString() };
      }),
    )
    .catch((error: unknown) => {
      if (error instanceof DailyReportNotSent) return null;
      throw error;
    });
  if (outcome === null) return { sent: false, alreadySent: false };
  return { sent: outcome.executed, alreadySent: !outcome.executed };
}

class DailyReportNotSent extends Error {
  constructor() {
    super('The daily owner emails could not be sent (mail is not configured or has no recipient).');
  }
}
