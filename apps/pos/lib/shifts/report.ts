import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { dbRead, cashMovements, invoices, payments, users } from '@natech/db';
import { paisa, parseQty, sum, type Paisa } from '@natech/domain';
import type { CashMovementRow, PaymentMixRow, ShiftReport } from '@natech/contracts';
import { formatPaisa } from '@natech/ui';
import { formatQty } from '@/components/lib/format';
import { readCurrentBusinessDate } from '../outlet/queries';
import { sendOwnerReport, VENDOR_REPORT_INBOX } from '../mail';
import { readChannelMix, readItemSales } from '../reports/sales';
import type { Shift } from './queries';

/** Render boundary for this file's one non-React output — an email body (R1: `formatPaisa` is the sanctioned formatter outside a component tree, the same one `lib/printing/documents.ts`'s ESC/POS text uses). */
function rs(value: Paisa | null): string {
  return value === null ? '—' : formatPaisa(value, { symbol: 'Rs.' });
}

/**
 * The X/Z report — BUILD-PLAN.md §12, §17; docs/runfiles/M12-shifts.md §3.
 * One function, called identically by `/admin/reports/shift` (read) and
 * `closeShiftAction` (the emailed Z) — the two are the same figures by
 * construction, never two computations that could drift.
 *
 * Every figure here is windowed against the shift's own `openedAt`..`closedAt
 * ?? now`, not a `shiftId` foreign key — `payments`/`invoices` carry none
 * (the frozen schema, M02), so time is the only join available, and it is
 * the correct one: at most one shift is ever open at a time. `cash_movements`
 * is the one table that *does* carry `shiftId` and is read by it directly.
 */
const PAYMENT_METHODS = ['CASH', 'CARD', 'WALLET', 'QR'] as const;

function bps(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.min(10_000, Math.max(0, Math.round((numerator / denominator) * 10_000)));
}

export async function readShiftReport(shift: Shift): Promise<ShiftReport> {
  const [paymentRows, movementRows, invoiceRows, businessDate] = await Promise.all([
    dbRead()
      .select({
        method: payments.method,
        amount: payments.amount,
        attemptStatus: payments.attemptStatus,
      })
      .from(payments)
      .innerJoin(invoices, eq(invoices.id, payments.invoiceId))
      .where(
        and(eq(invoices.shiftId, shift.id), isNull(payments.deletedAt), isNull(invoices.deletedAt)),
      ),
    dbRead()
      .select({
        id: cashMovements.id,
        type: cashMovements.type,
        amount: cashMovements.amount,
        reason: cashMovements.reason,
        actorName: users.displayName,
        at: cashMovements.createdAt,
      })
      .from(cashMovements)
      .leftJoin(users, eq(cashMovements.actorId, users.id))
      .where(and(eq(cashMovements.shiftId, shift.id), isNull(cashMovements.deletedAt))),
    dbRead()
      .select({
        id: invoices.id,
        taxableBase: invoices.taxableBase,
        taxTotal: invoices.taxTotal,
      })
      .from(invoices)
      .where(and(eq(invoices.shiftId, shift.id), isNull(invoices.deletedAt))),
    readCurrentBusinessDate(shift.openedAt),
  ]);

  const approvedTotal = sum(
    paymentRows.filter((row) => row.attemptStatus === 'APPROVED').map((row) => paisa(row.amount)),
  );
  const paymentMix: PaymentMixRow[] = PAYMENT_METHODS.map((method) => {
    const forMethod = paymentRows.filter((row) => row.method === method);
    const amount = sum(
      forMethod.filter((row) => row.attemptStatus === 'APPROVED').map((row) => paisa(row.amount)),
    );
    return {
      method,
      approvedCount: forMethod.filter((row) => row.attemptStatus === 'APPROVED').length,
      declinedCount: forMethod.filter((row) => row.attemptStatus === 'DECLINED').length,
      amount,
      shareBps: bps(Number(amount), Number(approvedTotal)),
    };
  });

  const cashMovementRows: CashMovementRow[] = movementRows.map((row) => ({
    id: row.id,
    type: row.type,
    amount: paisa(row.amount),
    reason: row.reason ?? '',
    actorName: row.actorName ?? 'Unknown',
    at: row.at,
  }));

  const cashIn = sum(
    movementRows.filter((row) => row.type === 'PAY_IN').map((row) => paisa(row.amount)),
  );
  const cashOut = sum(
    movementRows.filter((row) => row.type !== 'PAY_IN').map((row) => paisa(row.amount)),
  );
  const cashPayments = sum(
    paymentRows
      .filter((row) => row.method === 'CASH' && row.attemptStatus === 'APPROVED')
      .map((row) => paisa(row.amount)),
  );
  const expectedCash: Paisa = paisa(shift.openingFloat + cashPayments + cashIn - cashOut);

  const netSales = sum(invoiceRows.map((row) => paisa(row.taxableBase)));
  const taxCollected = sum(invoiceRows.map((row) => paisa(row.taxTotal)));

  return {
    shiftId: shift.id,
    kind: shift.status === 'OPEN' ? 'X' : 'Z',
    openedAt: shift.openedAt,
    closedAt: shift.closedAt,
    openedByName: shift.openedByName ?? 'Auto-opened',
    businessDate,
    openingFloat: shift.openingFloat,
    expectedCash,
    countedCash: shift.countedCash,
    variance: shift.variance,
    paymentMix,
    cashMovements: cashMovementRows,
    invoiceCount: invoiceRows.length,
    netSales,
    taxCollected,
  };
}

const TOP_ITEM_LIMIT = 10;

/**
 * The Z report, emailed on close — §12 "X and Z reports via Resend".
 *
 * Recipients are resolved by `lib/mail.ts`: every active OWNER, plus the
 * vendor's own inbox. The vendor copy is deliberate — a variance nobody
 * queried for a week is the failure mode §21 records, and support cannot
 * notice what it never receives.
 *
 * The shift figures above are shift-windowed. The last two sections are the
 * business **day**, read through the same §17 report queries the reports
 * screens use rather than a second computation that could disagree with them
 * (R16). They are labelled as the day, not the shift, because on a day with
 * two shifts they are not the same figures and the email must not imply they
 * are.
 *
 * Skip-rather-than-throw throughout: a shift still closes correctly with
 * Resend unconfigured, matching every other send in this codebase.
 */
export async function sendZReportEmail(report: ShiftReport): Promise<boolean> {
  const range = { fromBusinessDate: report.businessDate, toBusinessDate: report.businessDate };
  const [itemSales, channelMix] = await Promise.all([readItemSales(range), readChannelMix(range)]);

  const lines = [
    `Z report — shift opened ${report.openedAt.toISOString()} by ${report.openedByName}, business date ${report.businessDate}`,
    `Closed ${report.closedAt?.toISOString() ?? '—'}`,
    '',
    `Net sales: ${rs(report.netSales)}  Tax collected: ${rs(report.taxCollected)}`,
    `Opening float: ${rs(report.openingFloat)}  Expected cash: ${rs(report.expectedCash)}  Counted: ${rs(report.countedCash)}  Variance: ${rs(report.variance)}`,
    `Invoices: ${report.invoiceCount}`,
    '',
    'Payment mix:',
    ...report.paymentMix.map(
      (row) =>
        `  ${row.method}: ${row.approvedCount} approved, ${row.declinedCount} declined, ${rs(row.amount)}`,
    ),
    '',
    'Cash movements:',
    ...(report.cashMovements.length === 0
      ? ['  none']
      : report.cashMovements.map(
          (row) => `  ${row.type} ${rs(row.amount)} — ${row.reason} (${row.actorName})`,
        )),
    '',
    `Business day ${report.businessDate} — channel mix:`,
    ...channelMix.map((row) => `  ${row.channel}: ${row.orderCount} orders, ${rs(row.netSales)}`),
    '',
    `Business day ${report.businessDate} — top ${TOP_ITEM_LIMIT} items by net sales:`,
    ...(itemSales.length === 0
      ? ['  none']
      : itemSales
          .slice(0, TOP_ITEM_LIMIT)
          .map(
            (row) =>
              `  ${row.itemName} (${row.categoryName}): ${formatQty(parseQty(row.qtySold))} sold, ${rs(row.netSales)}`,
          )),
  ];

  return sendOwnerReport(`Z report — ${report.businessDate}`, lines.join('\n'), [
    VENDOR_REPORT_INBOX,
  ]);
}
