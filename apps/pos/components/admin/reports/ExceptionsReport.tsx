'use client';

import { useState } from 'react';
import { CircleAlert, ShieldCheck } from 'lucide-react';
import { DataTable, Money, SegmentedControl, StatusPill } from '@natech/ui';
import { paisa } from '@natech/domain';
import type { DateRange, ExceptionKind, ExceptionRow } from '@natech/contracts';
import { ReportShell } from './ReportShell';
import { formatDateTime } from '@/components/lib/format';

/**
 * Exceptions — BUILD-PLAN.md §17, §5.8; docs/runfiles/M13-reporting.md §3.
 *
 * Every row names an actor, and where the plan requires one, the supervisor who
 * authorised it. That is the point of the report: an exception nobody is named
 * against is a policy nobody follows.
 *
 * `DISCOUNT` and `PRICE_OVERRIDE` are real filter options that never populate —
 * nothing in this codebase persists either kind yet (the runfile's own §3).
 * They stay in the list rather than being hidden, so the `ALL` view is honest
 * about what it is not showing.
 *
 * Real data since M13 (`lib/reports/exceptions.ts`). Markup unchanged from the
 * M06 mock (props swapped, not redesigned).
 */
const KINDS: readonly { value: ExceptionKind | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'DECLINED_CARD', label: 'Declined cards' },
  { value: 'DISCOUNT', label: 'Discounts' },
  { value: 'VOID_ORDER', label: 'Order voids' },
  { value: 'PRICE_OVERRIDE', label: 'Price overrides' },
  // ADR 0027. Listed last but it is the one to read first: every other kind
  // here is a sale the system knows about, and this is the kind that says a
  // customer was quoted a total the system never collected.
  { value: 'BILL_NOT_FINALIZED', label: 'Unfinalized bills' },
];

export interface ExceptionsReportProps {
  readonly range: DateRange;
  readonly timezone: string;
  readonly exceptions: readonly ExceptionRow[];
}

export function ExceptionsReport({ range, timezone, exceptions }: ExceptionsReportProps) {
  const [kind, setKind] = useState<ExceptionKind | 'ALL'>('ALL');
  const rows = exceptions.filter((row) => kind === 'ALL' || row.kind === kind);

  return (
    <ReportShell
      title="Exceptions"
      note="Review unfinalized bills, voids, discounts, price overrides, and declined card attempts, including the staff member responsible."
      range={range}
      reportKind="exceptions"
    >
      <div className="mb-4">
        <SegmentedControl
          label="Exception kind"
          value={kind}
          onChange={setKind}
          options={KINDS.map((entry) => ({
            value: entry.value,
            label: entry.label,
            count:
              entry.value === 'ALL'
                ? exceptions.length
                : exceptions.filter((row) => row.kind === entry.value).length,
          }))}
        />
      </div>

      <DataTable
        rows={rows}
        getRowId={(row) => row.id}
        caption="Exception report"
        emptyTitle="Nothing of that kind in this range"
        summary={(visible) => (
          <span>
            <strong className="text-ink tabular-nums">{visible.length}</strong> exceptions ·{' '}
            <Money
              value={paisa(visible.reduce((total, row) => total + row.amount, 0n))}
              symbol="Rs."
              emphasis="strong"
            />{' '}
            affected ·{' '}
            <strong className="text-ink tabular-nums">
              {visible.filter((row) => row.supervisorName !== null).length}
            </strong>{' '}
            supervisor-authorised
          </span>
        )}
        columns={[
          {
            key: 'kind',
            header: 'Kind',
            render: (row) => (
              <StatusPill
                size="sm"
                tone={
                  row.kind === 'VOID_ORDER' || row.kind === 'BILL_NOT_FINALIZED' ? 'danger' : 'warn'
                }
                icon={CircleAlert}
                label={row.kind.replaceAll('_', ' ').toLowerCase()}
              />
            ),
          },
          {
            key: 'reference',
            header: 'Reference',
            render: (row) => (
              <span>
                <span className="font-medium">{row.reference}</span>
                {row.tableCode !== null && (
                  <span className="text-ink-subtle block text-xs">Table {row.tableCode}</span>
                )}
              </span>
            ),
          },
          {
            key: 'actor',
            header: 'Who',
            render: (row) => (
              <span>
                {row.actorName}
                {row.supervisorName !== null && (
                  <span className="text-ink-subtle block text-xs">
                    <ShieldCheck aria-hidden="true" className="inline size-3" />{' '}
                    {row.supervisorName}
                  </span>
                )}
              </span>
            ),
          },
          {
            key: 'reason',
            header: 'Reason',
            secondary: true,
            render: (row) => <span className="text-sm">{row.reason ?? '—'}</span>,
          },
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
