'use client';

import { ArrowDownToLine, ArrowUpFromLine, Vault } from 'lucide-react';
import Link from 'next/link';
import { DataTable, Money, StatCard, StatusPill } from '@natech/ui';
import { paisa } from '@natech/domain';
import type { ShiftReport as ShiftReportData } from '@natech/contracts';
import { ReportShell } from './ReportShell';
import { formatDateTime } from '@/components/lib/format';

/**
 * Shift X and Z — BUILD-PLAN.md §12, §17, §5.9; docs/runfiles/M12-shifts.md.
 *
 * An X report is a mid-shift read; a Z closes the shift. Both carry the same
 * body.
 *
 * Real data since M12 — `apps/pos/lib/shifts/report.ts`'s `readShiftReport`,
 * the same function that builds the emailed Z on close. Markup unchanged from
 * the M04/M05 mock (props swapped, not redesigned), mirroring M11's own
 * `ComplianceDashboard` extraction.
 */
const MOVEMENT_ICONS = {
  PAY_IN: ArrowDownToLine,
  PAY_OUT: ArrowUpFromLine,
  DROP: Vault,
} as const;

export interface ShiftReportProps {
  readonly report: ShiftReportData;
  readonly timezone: string;
}

export function ShiftReport({ report, timezone }: ShiftReportProps) {
  const movementTotal = paisa(
    report.cashMovements.reduce(
      (running, movement) =>
        running + (movement.type === 'PAY_IN' ? movement.amount : -movement.amount),
      0n,
    ),
  );

  return (
    <ReportShell
      title={`Shift ${report.kind} report`}
      note="An X report reads the shift without closing it. A Z closes it and is emailed to the owner."
      range={{ fromBusinessDate: report.businessDate, toBusinessDate: report.businessDate }}
      reportKind="shift"
    >
      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Opened"
          value={formatDateTime(report.openedAt, timezone)}
          caption={`by ${report.openedByName}`}
        />

        <StatCard
          label="Net sales"
          value={<Money value={report.netSales} symbol="Rs." />}
          caption={
            <>
              tax <Money value={report.taxCollected} symbol="Rs." />
            </>
          }
        />

        <StatCard
          label="Cash expected"
          value={<Money value={report.expectedCash} symbol="Rs." />}
          caption={
            <>
              float <Money value={report.openingFloat} symbol="Rs." /> · movements{' '}
              <Money value={movementTotal} symbol="Rs." />
            </>
          }
        />
      </div>

      <p className="mb-6 text-sm">
        <Link
          className="text-primary font-medium underline underline-offset-4"
          href={`/admin/invoices?shiftId=${encodeURIComponent(report.shiftId)}`}
        >
          View {report.invoiceCount} invoice{report.invoiceCount === 1 ? '' : 's'} in this shift
        </Link>
      </p>

      <h2 className="mb-2 text-sm font-semibold">Payment mix</h2>
      <DataTable
        rows={report.paymentMix}
        getRowId={(row) => row.method}
        caption="Payment mix for the shift"
        className="mb-6"
        summary={(rows) => (
          <span>
            <Money
              value={paisa(rows.reduce((running, row) => running + row.amount, 0n))}
              symbol="Rs."
              emphasis="strong"
            />{' '}
            taken ·{' '}
            <strong className="text-ink tabular-nums">
              {rows.reduce((running, row) => running + row.declinedCount, 0)}
            </strong>{' '}
            declined attempts
          </span>
        )}
        columns={[
          { key: 'method', header: 'Method', render: (row) => row.method },
          {
            key: 'approved',
            header: 'Approved',
            numeric: true,
            render: (row) => <span className="tabular-nums">{row.approvedCount}</span>,
          },
          {
            key: 'declined',
            header: 'Declined',
            numeric: true,
            render: (row) => <span className="tabular-nums">{row.declinedCount}</span>,
          },
          {
            key: 'amount',
            header: 'Taken',
            numeric: true,
            render: (row) => <Money value={row.amount} />,
          },
        ]}
      />

      <h2 className="mb-2 text-sm font-semibold">Cash movements</h2>
      <DataTable
        rows={report.cashMovements}
        getRowId={(row) => row.id}
        caption="Cash movements"
        emptyTitle="No pay-ins, pay-outs, or drops this shift"
        summary={(rows) => (
          <span>
            <strong className="text-ink tabular-nums">{rows.length}</strong> movements · net{' '}
            <Money
              value={paisa(
                rows.reduce(
                  (running, row) => running + (row.type === 'PAY_IN' ? row.amount : -row.amount),
                  0n,
                ),
              )}
              symbol="Rs."
              emphasis="strong"
            />
          </span>
        )}
        columns={[
          {
            key: 'type',
            header: 'Type',
            render: (row) => (
              <StatusPill
                size="sm"
                tone={row.type === 'PAY_IN' ? 'ok' : 'neutral'}
                icon={MOVEMENT_ICONS[row.type]}
                label={row.type.replace('_', ' ').toLowerCase()}
              />
            ),
          },
          { key: 'reason', header: 'Reason', render: (row) => row.reason },
          { key: 'actor', header: 'Who', secondary: true, render: (row) => row.actorName },
          {
            key: 'at',
            header: 'When',
            secondary: true,
            render: (row) => formatDateTime(row.at, timezone),
          },
          {
            key: 'amount',
            header: 'Amount',
            numeric: true,
            render: (row) => <Money value={row.amount} />,
          },
        ]}
      />
    </ReportShell>
  );
}
