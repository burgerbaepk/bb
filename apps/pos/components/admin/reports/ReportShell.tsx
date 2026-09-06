'use client';

import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, TextField } from '@natech/ui';
import type { DateRange, ExportFormat } from '@natech/contracts';
import type { ChangeEvent, ReactNode } from 'react';
import { PageHeading } from '../PageHeading';

/**
 * The frame every §17 report sits in — BUILD-PLAN.md §17;
 * docs/runfiles/M13-reporting.md §3.
 *
 * Two things it standardises.
 *
 * **The range is URL state**, not component state: `?from=&to=` on the page's
 * own URL, read server-side by the page and handed back here as `range`.
 * Editing a date field navigates (`router.push`, committed on blur so typing
 * does not fire a request per keystroke); the same resolved range then drives
 * both the rendered table and the export link below, so the two can never
 * show different figures for what looks like the same range (R16, extended
 * from "header matches its list" to "export matches its screen"). Defect C6
 * is an invoice numbered for the 21st shown against the 22nd because the date
 * was derived from a timestamp at read time; a report that says "date"
 * without saying which one invites the same confusion at scale.
 *
 * **Exports are generated server-side behind a permission check** (§17):
 * `/api/reports/export` does the work; these buttons only navigate to it
 * (`window.location.assign`, so the server's `Content-Disposition` triggers a
 * download without leaving the page). `reportKind` names which of that
 * route's dispatch cases this screen is — the caller's job to say, since only
 * it knows which table (or which tab, for a tabbed report) is on screen.
 */
export interface ReportShellProps {
  readonly title: string;
  readonly note: string;
  readonly range: DateRange;
  readonly reportKind: string;
  readonly children: ReactNode;
}

const FORMATS: readonly { value: ExportFormat; label: string; icon: typeof Download }[] = [
  { value: 'CSV', label: 'CSV', icon: FileText },
  { value: 'XLSX', label: 'Excel', icon: FileSpreadsheet },
  { value: 'PDF', label: 'PDF', icon: Download },
];

export function ReportShell({ title, note, range, reportKind, children }: ReportShellProps) {
  const router = useRouter();
  const pathname = usePathname();

  function commitRange(next: DateRange): void {
    const params = new URLSearchParams({ from: next.fromBusinessDate, to: next.toBusinessDate });
    router.push(`${pathname}?${params.toString()}`);
  }

  function exportUrl(format: ExportFormat): string {
    const params = new URLSearchParams({
      report: reportKind,
      format,
      from: range.fromBusinessDate,
      to: range.toBusinessDate,
    });
    return `/api/reports/export?${params.toString()}`;
  }

  return (
    <>
      <PageHeading
        title={title}
        note={note}
        actions={FORMATS.map((format) => (
          <Button
            key={format.value}
            icon={format.icon}
            onClick={() => {
              window.location.assign(exportUrl(format.value));
            }}
          >
            {format.label}
          </Button>
        ))}
      />

      <div
        key={`${range.fromBusinessDate}_${range.toBusinessDate}`}
        className="border-border bg-surface-raised mb-5 flex flex-wrap items-end gap-3 rounded-base border p-3"
      >
        <TextField
          label="From business date"
          defaultValue={range.fromBusinessDate}
          onBlur={(event: ChangeEvent<HTMLInputElement>) =>
            commitRange({
              fromBusinessDate: event.target.value,
              toBusinessDate: range.toBusinessDate,
            })
          }
          tabular
          className="w-44"
        />
        <TextField
          label="To business date"
          defaultValue={range.toBusinessDate}
          onBlur={(event: ChangeEvent<HTMLInputElement>) =>
            commitRange({
              fromBusinessDate: range.fromBusinessDate,
              toBusinessDate: event.target.value,
            })
          }
          tabular
          className="w-44"
        />
        <p className="text-ink-subtle pb-2 text-xs">
          Business dates, stamped at finalize from the 05:00 cutoff — not clock time.
        </p>
      </div>

      {children}
    </>
  );
}
