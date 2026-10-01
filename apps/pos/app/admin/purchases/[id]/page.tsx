import Link from 'next/link';
import { notFound } from 'next/navigation';
import { can } from '@natech/contracts';
import { DataTable, Money } from '@natech/ui';
import { PageHeading } from '@/components/admin/PageHeading';
import { PrintButton } from '@/components/admin/PrintButton';
import { CancelBillForm } from '@/components/admin/purchasing/CancelBillForm';
import { requirePermissionPage } from '@/lib/auth/session';
import { readBill } from '@/lib/purchasing/queries';
import { showQty } from '@/lib/stock/ledger';

/** One supplier bill — ADR 0035. Read-only once posted; cancel is the only change. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requirePermissionPage('reports.read');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const bill = await readBill(id);
  if (bill === null) notFound();

  return (
    <div className="print-document space-y-5">
      <PageHeading
        title={`Bill #${bill.billNo}${bill.status === 'CANCELLED' ? ' — cancelled' : ''}`}
        note={[
          bill.supplierName,
          bill.supplierRef === null ? null : `their invoice ${bill.supplierRef}`,
          `dated ${bill.billedOn}`,
          bill.dueOn === null ? null : `due ${bill.dueOn}`,
          bill.poNo === null ? null : `against PO #${bill.poNo}`,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={<PrintButton label="Print bill" />}
      />
      {bill.cancelReason !== null && (
        <p className="text-danger text-sm">Cancelled: {bill.cancelReason}</p>
      )}
      <DataTable
        rows={bill.lines}
        getRowId={(row) => row.id}
        caption="Lines"
        emptyTitle="No lines"
        columns={[
          {
            key: 'item',
            header: 'Item',
            render: (row) => (
              <Link href={`/admin/stock/${row.itemId}`} className="underline">
                {row.name}
              </Link>
            ),
          },
          {
            key: 'qty',
            header: 'Quantity',
            numeric: true,
            render: (row) => `${showQty(row.quantity)}${row.unit === null ? '' : ` ${row.unit}`}`,
          },
          {
            key: 'amount',
            header: 'Amount',
            numeric: true,
            render: (row) => (row.amount === null ? '—' : <Money value={row.amount} />),
          },
        ]}
      />
      <dl className="border-border bg-surface-raised ms-auto max-w-sm space-y-1 rounded-base border p-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-muted">Other charges</dt>
          <dd>
            <Money value={bill.charges} />
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-muted">Discount</dt>
          <dd>
            <Money value={bill.discount} />
          </dd>
        </div>
        <div className="border-border flex justify-between border-t pt-2 text-base font-semibold">
          <dt>Total</dt>
          <dd>
            <Money value={bill.total} symbol="Rs." emphasis="strong" />
          </dd>
        </div>
      </dl>
      {bill.note !== null && <p className="text-sm">Note: {bill.note}</p>}
      <p className="text-ink-subtle text-xs">
        Entered by {bill.createdBy ?? 'unknown'} ·{' '}
        <Link href={`/admin/suppliers/${bill.supplierId}`} className="underline">
          {bill.supplierName}&apos;s statement
        </Link>
      </p>
      {bill.status === 'POSTED' && can(viewer, 'expenses.write') && (
        <CancelBillForm billId={bill.id} />
      )}
    </div>
  );
}
