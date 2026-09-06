'use client';

import { Archive, Scale, ShieldCheck } from 'lucide-react';
import { DataTable, Money, StatusPill } from '@natech/ui';
import type { AuditorPack } from '@natech/contracts';
import { ReportShell } from './ReportShell';
import { formatBusinessDate, formatDateTime } from '@/components/lib/format';

/**
 * The auditor access pack — BUILD-PLAN.md §17, PSTSA s.32(1) and s.32(2);
 * docs/runfiles/M13-reporting.md §3.
 *
 * s.32(2) obliges the taxpayer to grant an officer full access to electronic
 * records. Doing that by handing over a database login is not access; it is
 * exposure. So the product produces a read-only, date-ranged export instead,
 * behind the `AUDITOR` role and a permission check.
 *
 * s.32(1) requires six years of retention from the end of the financial year,
 * which is why the retention date is stated on the pack rather than assumed.
 * Nothing in the covered tables is ever purged inside that window: invoices,
 * invoice lines, payments, checks, tax snapshots, credit notes, and audit rows.
 *
 * `contents` is a manifest of row counts, not the rows themselves — its own
 * export (below) serialises that manifest, the same as every other report's
 * export serialises what is on its screen. A real row-level bulk export is a
 * different, unspecified mechanism this milestone did not build (the runfile's
 * own §3 and carried-forward table).
 *
 * Real data since M13 (`lib/reports/auditorPack.ts`). Markup unchanged from
 * the M06 mock (props swapped, not redesigned).
 */
export interface AuditorPackReportProps {
  readonly pack: AuditorPack;
  readonly timezone: string;
}

export function AuditorPackReport({ pack, timezone }: AuditorPackReportProps) {
  return (
    <ReportShell
      title="Auditor access pack"
      note="Review invoice counts, tax totals, and record counts for a date range. Export the summary for audit preparation."
      range={pack.range}
      reportKind="auditor-pack"
    >
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <article className="border-border bg-surface-raised rounded-base border p-4">
          <h2 className="text-ink-muted mb-1 text-sm font-medium">Invoices in range</h2>
          <p className="text-2xl font-semibold tabular-nums">{pack.invoiceCount}</p>
          <p className="text-ink-muted text-sm">{pack.creditNoteCount} credit notes</p>
        </article>
        <article className="border-border bg-surface-raised rounded-base border p-4">
          <h2 className="text-ink-muted mb-1 text-sm font-medium">Tax collected</h2>
          <p className="text-2xl font-semibold">
            <Money value={pack.taxCollected} symbol="Rs." />
          </p>
          <p className="text-ink-muted text-sm">
            {formatBusinessDate(pack.range.fromBusinessDate)} to{' '}
            {formatBusinessDate(pack.range.toBusinessDate)}
          </p>
        </article>
        <article className="border-ok bg-ok-soft rounded-base border p-4">
          <h2 className="mb-1 flex items-center gap-1.5 text-sm font-medium">
            <Archive aria-hidden="true" className="size-4" />
            Retained until
          </h2>
          <p className="text-2xl font-semibold tabular-nums">{pack.retentionUntil}</p>
          <p className="text-sm opacity-80">
            Six years from the end of the financial year, s.32(1)
          </p>
        </article>
      </div>

      <DataTable
        rows={pack.contents}
        getRowId={(row) => row.label}
        caption="What the pack contains"
        summary={(rows) => (
          <span>
            <strong className="text-ink tabular-nums">
              {rows.reduce((running, row) => running + row.rowCount, 0)}
            </strong>{' '}
            rows across <strong className="text-ink tabular-nums">{rows.length}</strong> record sets
          </span>
        )}
        columns={[
          {
            key: 'label',
            header: 'Records',
            render: (row) => (
              <span className="flex items-center gap-2">
                <ShieldCheck aria-hidden="true" className="text-ink-subtle size-4 shrink-0" />
                {row.label}
              </span>
            ),
          },
          {
            key: 'count',
            header: 'Rows',
            numeric: true,
            render: (row) => <span className="tabular-nums">{row.rowCount}</span>,
          },
        ]}
      />

      <p className="text-ink-muted mt-4 flex max-w-3xl items-start gap-2 text-sm">
        <Scale aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Generated {formatDateTime(pack.generatedAt, timezone)}. Records are kept in English, which
        s.31(1) permits alongside Urdu.
      </p>

      <p className="text-ink-subtle mt-2 flex items-center gap-2 text-sm">
        <StatusPill size="sm" tone="neutral" icon={ShieldCheck} label="Read-only access" />
        Records can only be viewed on this screen.
      </p>
    </ReportShell>
  );
}
