import { notFound } from 'next/navigation';
import { DataTable } from '@natech/ui';
import { PageHeading } from '@/components/admin/PageHeading';
import { requirePermissionPage } from '@/lib/auth/session';
import { KIND_LABEL, showQty } from '@/lib/stock/ledger';
import { readItemHistory } from '@/lib/stock/queries';

/**
 * One item's movements — ADR 0034. Newest first, with the book after each
 * row, so a count's variance reads against what the book said at the time.
 */
export default async function Page({ params }: { params: Promise<{ itemId: string }> }) {
  await requirePermissionPage('reports.read');
  const { itemId } = await params;
  // A malformed id would reach Postgres as a uuid cast error; treat it as absent.
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) notFound();
  const history = await readItemHistory(itemId);
  if (history === null) notFound();
  const { item, rows } = history;
  const unit = item.unit === null ? '' : ` ${item.unit}`;

  return (
    <>
      <PageHeading
        title={item.name}
        note={`${item.category} · every movement, newest first. A count shows the difference it found against the book.`}
      />
      <DataTable
        rows={rows}
        getRowId={(row) => row.id}
        caption={`${item.name} movements`}
        emptyTitle="No movements yet"
        columns={[
          { key: 'date', header: 'Date', render: (row) => row.occurredOn },
          { key: 'kind', header: 'Movement', render: (row) => KIND_LABEL[row.kind] },
          {
            key: 'qty',
            header: 'Quantity',
            numeric: true,
            render: (row) => `${showQty(row.quantity)}${unit}`,
          },
          {
            key: 'delta',
            header: 'Change',
            numeric: true,
            // Signed on purpose: "−0.4" on a count is the shrinkage, and it is
            // a quantity, not a duration, so R13 does not apply.
            render: (row) => `${row.delta > 0n ? '+' : ''}${showQty(row.delta)}`,
          },
          {
            key: 'balance',
            header: 'Book after',
            numeric: true,
            render: (row) => `${showQty(row.balance)}${unit}`,
          },
          {
            key: 'note',
            header: 'Note',
            secondary: true,
            render: (row) => (
              <div>
                <p>{row.note ?? ''}</p>
                <p className="text-ink-subtle text-xs">{row.recordedBy ?? ''}</p>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
