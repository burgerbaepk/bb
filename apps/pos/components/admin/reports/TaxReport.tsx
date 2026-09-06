'use client';

import { Scale } from 'lucide-react';
import { DataTable, Money, StatusPill } from '@natech/ui';
import { paisa } from '@natech/domain';
import type { DateRange, TaxLiabilityRow } from '@natech/contracts';
import { ReportShell } from './ReportShell';
import { formatRate } from '@/components/lib/format';

/**
 * Tax summary reporting by rate and payment method.
 * M13-reporting.md §3.
 *
 * Taxable value and tax collected, split by rate, per tax period. The split is
 * by rate **and by payment method** because that is what determines the rate:
 * 16% on cash, 8% on card and digital, and a split payment contributes a row to
 * each (§6.6). Averaging the two into one effective rate would produce a figure
 * that reconciles against nothing.
 *
 * Every row carries its statutory basis. A rate without one is unauditable, and
 * PSTSA s.17 makes tax collected in excess payable to Government whether or not
 * anybody can explain how it was arrived at.
 *
 * Real data since M13 (`lib/reports/tax.ts`). Markup unchanged from the M06
 * mock (props swapped, not redesigned).
 */
export interface TaxReportProps {
  readonly range: DateRange;
  readonly rows: readonly TaxLiabilityRow[];
}

export function TaxReport({ range, rows }: TaxReportProps) {
  return (
    <ReportShell
      title="Tax summary"
      note="Taxable value and tax collected, split by rate and by the payment method that set it."
      range={range}
      reportKind="tax-liability"
    >
      <DataTable
        rows={rows}
        getRowId={(row) => `${row.taxClass}-${row.rateBps}-${row.method}`}
        caption="Tax liability by rate"
        summary={(visible) => (
          <span>
            Taxable{' '}
            <Money
              value={paisa(visible.reduce((total, row) => total + row.taxableValue, 0n))}
              symbol="Rs."
              emphasis="strong"
            />{' '}
            · tax collected{' '}
            <Money
              value={paisa(visible.reduce((total, row) => total + row.taxCollected, 0n))}
              symbol="Rs."
              emphasis="strong"
            />{' '}
            across{' '}
            <strong className="text-ink tabular-nums">
              {visible.reduce((total, row) => total + row.invoiceCount, 0)}
            </strong>{' '}
            invoices
          </span>
        )}
        columns={[
          { key: 'class', header: 'Tax class', render: (row) => row.taxClass },
          {
            key: 'rate',
            header: 'Rate',
            render: (row) => (
              <span className="tabular-nums">
                {formatRate(row.rateBps)}
                <span className="text-ink-subtle ms-2 text-xs">{row.method.toLowerCase()}</span>
              </span>
            ),
          },
          {
            key: 'basis',
            header: 'Basis',
            secondary: true,
            render: (row) => (
              <StatusPill size="sm" tone="neutral" icon={Scale} label={row.legalReference} />
            ),
          },
          {
            key: 'invoices',
            header: 'Invoices',
            numeric: true,
            secondary: true,
            render: (row) => <span className="tabular-nums">{row.invoiceCount}</span>,
          },
          {
            key: 'taxable',
            header: 'Taxable value',
            numeric: true,
            render: (row) => <Money value={row.taxableValue} />,
          },
          {
            key: 'tax',
            header: 'Tax collected',
            numeric: true,
            render: (row) => <Money value={row.taxCollected} emphasis="strong" />,
          },
        ]}
      />

      <p className="text-ink-muted mt-4 max-w-3xl text-sm">
        Tax is computed once, in the finalize transaction, from the payments actually recorded — and
        the rate resolves against when the service was provided, not when it was paid for. An order
        opened at 23:50 on 30 June and settled at 00:10 on 1 July across a rate change is taxed at
        the old rate.
      </p>
    </ReportShell>
  );
}
