import Link from 'next/link';
import { DataTable, Money } from '@natech/ui';
import type { StatementRow } from '@/lib/purchasing/rules';

/**
 * A ledger card with a running balance — the supplier statement (ADR 0035)
 * and the customer statement (ADR 0036). Printable: the page that renders it
 * is a `print-document`, so the owner can hand it over or send a photo of it.
 */
export function StatementTable({
  rows,
  debitLabel,
  creditLabel,
  balanceLabel,
}: {
  readonly rows: readonly StatementRow[];
  readonly debitLabel: string;
  readonly creditLabel: string;
  readonly balanceLabel: string;
}) {
  return (
    <DataTable
      rows={rows}
      getRowId={(row) => row.id}
      caption="Statement"
      emptyTitle="Nothing yet"
      columns={[
        { key: 'date', header: 'Date', render: (row) => row.date },
        {
          key: 'reference',
          header: 'Entry',
          render: (row) => (
            <div>
              {row.href === null ? (
                <p>{row.reference}</p>
              ) : (
                <Link href={row.href} className="underline">
                  {row.reference}
                </Link>
              )}
              {row.detail !== null && <p className="text-ink-subtle text-xs">{row.detail}</p>}
            </div>
          ),
        },
        {
          key: 'debit',
          header: debitLabel,
          numeric: true,
          render: (row) => (row.debit === null ? '' : <Money value={row.debit} />),
        },
        {
          key: 'credit',
          header: creditLabel,
          numeric: true,
          render: (row) => (row.credit === null ? '' : <Money value={row.credit} />),
        },
        {
          key: 'balance',
          header: balanceLabel,
          numeric: true,
          render: (row) => <Money value={row.balance} emphasis="strong" />,
        },
      ]}
    />
  );
}
