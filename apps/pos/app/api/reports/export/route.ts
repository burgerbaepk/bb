import { NextResponse } from 'next/server';
import { formatPaisa } from '@natech/ui';
import type { ExportFormat } from '@natech/contracts';
import { Forbidden, assertPermission, requireOperator } from '@/lib/auth/session';
import { readOutletTimezone } from '@/lib/outlet/queries';
import { readCurrentOrLastShift } from '@/lib/shifts/queries';
import { readShiftReport } from '@/lib/shifts/report';
import { readAuditorPack } from '@/lib/reports/auditorPack';
import { readExceptions } from '@/lib/reports/exceptions';
import { readFloorPerformance } from '@/lib/reports/floor';
import {
  readCategoryMix,
  readChannelMix,
  readItemSales,
  readPaymentMix,
  readSalesByDate,
} from '@/lib/reports/sales';
import { readTaxLiability } from '@/lib/reports/tax';
import { resolveReportRange } from '@/lib/reports/range';
import { toCsv, toPdfBuffer, toXlsxBuffer, type ExportColumn } from '@/lib/reports/export';
import { formatBusinessDate, formatDateTime, formatShare } from '@/components/lib/format';

/**
 * The one export route every §17 report shares — BUILD-PLAN.md §17;
 * docs/runfiles/M13-reporting.md §3.
 *
 * `?report=<kind>&format=CSV|XLSX|PDF&from=&to=` — a single dispatch from a
 * `report` kind string to the matching query and column list, rather than a
 * route per report. Permission-gated with a JSON 403, not a redirect: a
 * download click that fails should say so, not silently navigate away.
 */
export const maxDuration = 30;

function money(value: bigint): string {
  return formatPaisa(value, { symbol: 'Rs.' });
}

/**
 * `exceljs`'s own bundled `index.d.ts` re-declares a global `Buffer`
 * (`extends ArrayBuffer`) that merges with — and corrupts — Node's own for
 * the whole program once anything imports it (`lib/reports/export.ts` does,
 * for `toXlsxBuffer`), so `tsc` rejects a real `Buffer` as not assignable to
 * `BlobPart`. A purely nominal artifact of a third-party type bug, not a
 * runtime one — every buffer this route builds is a plain heap buffer. One
 * cast, here, rather than fighting the corrupted merge at each call site.
 */
function blobPart(buffer: Buffer): BlobPart {
  return buffer as unknown as BlobPart;
}

async function respond<Row>(
  title: string,
  columns: readonly ExportColumn<Row>[],
  rows: readonly Row[],
  format: ExportFormat,
): Promise<NextResponse> {
  const filename = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (format === 'CSV') {
    return new NextResponse(toCsv(columns, rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}.csv"`,
      },
    });
  }
  if (format === 'XLSX') {
    const buffer = await toXlsxBuffer(title, columns, rows);
    return new NextResponse(new Blob([blobPart(buffer)]), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}.xlsx"`,
      },
    });
  }
  const buffer = await toPdfBuffer(title, columns, rows);
  return new NextResponse(new Blob([blobPart(buffer)]), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}.pdf"`,
    },
  });
}

export async function GET(request: Request): Promise<NextResponse> {
  const viewer = await requireOperator();
  try {
    assertPermission(viewer, 'reports.export');
  } catch (error) {
    if (error instanceof Forbidden) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 403 });
    }
    throw error;
  }

  const url = new URL(request.url);
  const report = url.searchParams.get('report');
  const formatParam = url.searchParams.get('format');
  const format: ExportFormat | null =
    formatParam === 'CSV' || formatParam === 'XLSX' || formatParam === 'PDF' ? formatParam : null;
  if (format === null) {
    return NextResponse.json(
      { ok: false, error: 'format must be CSV, XLSX, or PDF.' },
      { status: 400 },
    );
  }

  const range = await resolveReportRange({
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
  });

  switch (report) {
    case 'sales-by-date': {
      const rows = await readSalesByDate(range);
      return respond(
        'Sales by business date',
        [
          { header: 'Business date', value: (row) => formatBusinessDate(row.businessDate) },
          { header: 'Invoices', value: (row) => String(row.invoiceCount) },
          { header: 'Covers', value: (row) => String(row.covers) },
          { header: 'Net sales', value: (row) => money(row.netSales) },
          { header: 'Tax collected', value: (row) => money(row.taxCollected) },
          { header: 'Delivery charges', value: (row) => money(row.deliveryCharge ?? 0n) },
          { header: 'Service charge', value: (row) => money(row.serviceCharge) },
          { header: 'Gross takings', value: (row) => money(row.grossTakings) },
        ],
        rows,
        format,
      );
    }
    case 'item-sales': {
      const rows = await readItemSales(range);
      return respond(
        'Item sales',
        [
          { header: 'Item', value: (row) => row.itemName },
          { header: 'Category', value: (row) => row.categoryName },
          { header: 'Sold', value: (row) => row.qtySold },
          { header: 'Net sales', value: (row) => money(row.netSales) },
        ],
        rows,
        format,
      );
    }
    case 'category-mix': {
      const rows = await readCategoryMix(range);
      return respond(
        'Category mix',
        [
          { header: 'Category', value: (row) => row.categoryName },
          { header: 'Items sold', value: (row) => String(row.itemCount) },
          { header: 'Net sales', value: (row) => money(row.netSales) },
          { header: 'Share', value: (row) => formatShare(row.shareBps) },
        ],
        rows,
        format,
      );
    }
    case 'channel-mix': {
      const rows = await readChannelMix(range);
      return respond(
        'Channel mix',
        [
          { header: 'Channel', value: (row) => row.channel },
          { header: 'Orders', value: (row) => String(row.orderCount) },
          { header: 'Net sales', value: (row) => money(row.netSales) },
          { header: 'Share', value: (row) => formatShare(row.shareBps) },
        ],
        rows,
        format,
      );
    }
    case 'payment-mix': {
      const rows = await readPaymentMix(range);
      return respond(
        'Payment method mix',
        [
          { header: 'Method', value: (row) => row.method },
          { header: 'Approved', value: (row) => String(row.approvedCount) },
          { header: 'Declined', value: (row) => String(row.declinedCount) },
          { header: 'Taken', value: (row) => money(row.amount) },
          { header: 'Share', value: (row) => formatShare(row.shareBps) },
        ],
        rows,
        format,
      );
    }
    case 'tax-liability': {
      const rows = await readTaxLiability(range);
      return respond(
        'Tax summary',
        [
          { header: 'Tax class', value: (row) => row.taxClass },
          { header: 'Rate', value: (row) => formatShare(row.rateBps) },
          { header: 'Method', value: (row) => row.method },
          { header: 'Basis', value: (row) => row.legalReference },
          { header: 'Invoices', value: (row) => String(row.invoiceCount) },
          { header: 'Taxable value', value: (row) => money(row.taxableValue) },
          { header: 'Tax collected', value: (row) => money(row.taxCollected) },
        ],
        rows,
        format,
      );
    }
    case 'floor-performance': {
      const rows = await readFloorPerformance(range);
      return respond(
        'Floor performance',
        [
          { header: 'Zone', value: (row) => row.zoneName },
          { header: 'Daypart', value: (row) => row.daypart },
          { header: 'Turns', value: (row) => row.turns },
          { header: 'Average dwell (s)', value: (row) => String(row.averageDwellSeconds) },
          { header: 'Covers', value: (row) => String(row.covers) },
          { header: 'Per seat-hour', value: (row) => money(row.revenuePerSeatHour) },
          { header: 'Dead time (s)', value: (row) => String(row.deadTableSeconds) },
        ],
        rows,
        format,
      );
    }
    case 'exceptions': {
      const [rows, timezone] = await Promise.all([readExceptions(range), readOutletTimezone()]);
      return respond(
        'Exceptions',
        [
          { header: 'Kind', value: (row) => row.kind },
          { header: 'Reference', value: (row) => row.reference },
          { header: 'Table', value: (row) => row.tableCode ?? '' },
          { header: 'Who', value: (row) => row.actorName },
          { header: 'Supervisor', value: (row) => row.supervisorName ?? '' },
          { header: 'Reason', value: (row) => row.reason ?? '' },
          { header: 'When', value: (row) => formatDateTime(row.at, timezone) },
          { header: 'Amount', value: (row) => money(row.amount) },
        ],
        rows,
        format,
      );
    }
    case 'auditor-pack': {
      const pack = await readAuditorPack(range);
      return respond(
        'Auditor access pack',
        [
          { header: 'Records', value: (row) => row.label },
          { header: 'Rows', value: (row) => String(row.rowCount) },
        ],
        pack.contents,
        format,
      );
    }
    case 'shift': {
      const shift = await readCurrentOrLastShift();
      if (shift === null) {
        return NextResponse.json(
          { ok: false, error: 'No shift has ever been opened.' },
          { status: 404 },
        );
      }
      const report = await readShiftReport(shift);
      return respond(
        `Shift ${report.kind} report`,
        [
          { header: 'Business date', value: (row) => formatBusinessDate(row.businessDate) },
          { header: 'Kind', value: (row) => row.kind },
          { header: 'Opened by', value: (row) => row.openedByName },
          { header: 'Net sales', value: (row) => money(row.netSales) },
          { header: 'Tax collected', value: (row) => money(row.taxCollected) },
          { header: 'Opening float', value: (row) => money(row.openingFloat) },
          { header: 'Expected cash', value: (row) => money(row.expectedCash) },
          {
            header: 'Counted cash',
            value: (row) => (row.countedCash === null ? '' : money(row.countedCash)),
          },
          {
            header: 'Variance',
            value: (row) => (row.variance === null ? '' : money(row.variance)),
          },
          { header: 'Invoices', value: (row) => String(row.invoiceCount) },
        ],
        [report],
        format,
      );
    }
    default:
      return NextResponse.json({ ok: false, error: 'Unknown report kind.' }, { status: 400 });
  }
}
