'use client';

import { DataTable, Duration, Money } from '@natech/ui';
import { paisa } from '@natech/domain';
import type { CoversPerWaiterRow, DateRange, FloorPerformanceRow } from '@natech/contracts';
import { ReportShell } from './ReportShell';

/**
 * Floor Performance — BUILD-PLAN.md §17, §5.5; docs/runfiles/M13-reporting.md §3.
 *
 * None of this is answerable without `table_sessions`, which is why §5.5 calls
 * that table mandatory. Without a session there is no dwell time, no covers
 * count, no table-turn metric, and no waiter attribution across two orders on
 * one table — and this report is four of those five.
 *
 * Dead-table time is the one an owner acts on. A zone with high dead time and
 * low turns is not a busy zone; it is a zone nobody is bussing.
 *
 * Real data since M13 (`lib/reports/floor.ts`). Markup unchanged from the M06
 * mock (props swapped, not redesigned). The export button targets
 * `floor-performance` only — the page's own headline table; covers-per-waiter
 * is view-only this milestone (see the runfile's carried-forward table).
 */
export interface FloorReportProps {
  readonly range: DateRange;
  readonly performance: readonly FloorPerformanceRow[];
  readonly coversPerWaiter: readonly CoversPerWaiterRow[];
}

export function FloorReport({ range, performance, coversPerWaiter }: FloorReportProps) {
  return (
    <ReportShell
      title="Floor performance"
      note="Review table turnover, visit duration, guest counts, revenue per seat-hour, and idle time."
      range={range}
      reportKind="floor-performance"
    >
      <h2 className="mb-2 text-sm font-semibold">By zone and daypart</h2>
      <DataTable
        rows={performance}
        getRowId={(row) => `${row.zoneName}-${row.daypart}`}
        caption="Floor performance by zone and daypart"
        className="mb-6"
        summary={(rows) => (
          <span>
            <strong className="text-ink tabular-nums">
              {rows.reduce((total, row) => total + row.covers, 0)}
            </strong>{' '}
            covers across <strong className="text-ink tabular-nums">{rows.length}</strong> zone and
            daypart pairs
          </span>
        )}
        columns={[
          { key: 'zone', header: 'Zone', render: (row) => row.zoneName },
          { key: 'daypart', header: 'Daypart', render: (row) => row.daypart },
          {
            key: 'turns',
            header: 'Turns',
            numeric: true,
            render: (row) => <span className="tabular-nums">{row.turns}</span>,
          },
          {
            key: 'dwell',
            header: 'Average dwell',
            numeric: true,
            render: (row) => (
              <Duration seconds={row.averageDwellSeconds} label={`${row.zoneName} dwell`} />
            ),
          },
          {
            key: 'covers',
            header: 'Covers',
            numeric: true,
            secondary: true,
            render: (row) => <span className="tabular-nums">{row.covers}</span>,
          },
          {
            key: 'seatHour',
            header: 'Per seat-hour',
            numeric: true,
            render: (row) => <Money value={row.revenuePerSeatHour} />,
          },
          {
            key: 'dead',
            header: 'Dead time',
            numeric: true,
            render: (row) => (
              <Duration
                seconds={row.deadTableSeconds}
                thresholds={{ targetSeconds: 3600, overdueSeconds: 10800 }}
                label={`${row.zoneName} dead time`}
              />
            ),
          },
        ]}
      />

      <h2 className="mb-2 text-sm font-semibold">Covers per waiter</h2>
      <DataTable
        rows={coversPerWaiter}
        getRowId={(row) => row.waiterName}
        caption="Covers per waiter"
        summary={(rows) => (
          <span>
            <strong className="text-ink tabular-nums">
              {rows.reduce((total, row) => total + row.covers, 0)}
            </strong>{' '}
            covers · net{' '}
            <Money
              value={paisa(rows.reduce((total, row) => total + row.netSales, 0n))}
              symbol="Rs."
              emphasis="strong"
            />
          </span>
        )}
        columns={[
          { key: 'waiter', header: 'Waiter', render: (row) => row.waiterName },
          {
            key: 'covers',
            header: 'Covers',
            numeric: true,
            render: (row) => <span className="tabular-nums">{row.covers}</span>,
          },
          {
            key: 'orders',
            header: 'Orders',
            numeric: true,
            secondary: true,
            render: (row) => <span className="tabular-nums">{row.orders}</span>,
          },
          {
            key: 'net',
            header: 'Net sales',
            numeric: true,
            render: (row) => <Money value={row.netSales} />,
          },
          {
            key: 'dwell',
            header: 'Average dwell',
            numeric: true,
            secondary: true,
            render: (row) => (
              <Duration seconds={row.averageDwellSeconds} label={`${row.waiterName} dwell`} />
            ),
          },
        ]}
      />
    </ReportShell>
  );
}
