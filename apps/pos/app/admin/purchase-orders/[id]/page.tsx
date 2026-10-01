import { notFound } from 'next/navigation';
import { ReceiptText } from 'lucide-react';
import { can } from '@natech/contracts';
import { Button, DataTable, Money } from '@natech/ui';
import { PageHeading } from '@/components/admin/PageHeading';
import { PrintButton } from '@/components/admin/PrintButton';
import { LinkButton } from '@/components/admin/purchasing/LinkButton';
import { requirePermissionPage } from '@/lib/auth/session';
import { setPurchaseOrderStatusAction } from '@/lib/purchasing/actions';
import { readPurchaseOrder } from '@/lib/purchasing/queries';
import { showQty } from '@/lib/stock/ledger';
import { PO_STATUS_LABEL } from '@/lib/purchasing/rules';

/**
 * One purchase order — ADR 0035. Printable: this page is the copy handed to
 * the supplier, so it prints as a document without the back-office chrome.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requirePermissionPage('reports.read');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const order = await readPurchaseOrder(id);
  if (order === null) notFound();
  const canWrite = can(viewer, 'expenses.write') && order.status === 'OPEN';

  return (
    <div className="print-document space-y-5">
      <PageHeading
        title={`Purchase order #${order.poNo}`}
        note={[
          `To ${order.supplierName}`,
          `ordered ${order.orderedOn}`,
          order.expectedOn === null ? null : `expected ${order.expectedOn}`,
          PO_STATUS_LABEL[order.status],
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <PrintButton label="Print order" />
            {canWrite && (
              <LinkButton href={`/admin/purchases/new?po=${order.id}`} icon={ReceiptText}>
                Enter the bill
              </LinkButton>
            )}
            {order.billId !== null && (
              <LinkButton href={`/admin/purchases/${order.billId}`} icon={ReceiptText}>
                View the bill
              </LinkButton>
            )}
          </>
        }
      />
      <DataTable
        rows={order.lines}
        getRowId={(row) => row.id}
        caption="Items ordered"
        emptyTitle="No items"
        summary={() => (
          <span>
            Agreed value: <Money value={order.expectedTotal} symbol="Rs." emphasis="strong" />
          </span>
        )}
        columns={[
          { key: 'item', header: 'Item', render: (row) => row.name },
          {
            key: 'qty',
            header: 'Quantity',
            numeric: true,
            render: (row) => `${showQty(row.quantity)}${row.unit === null ? '' : ` ${row.unit}`}`,
          },
          {
            key: 'amount',
            header: 'Agreed amount',
            numeric: true,
            render: (row) => (row.amount === null ? '—' : <Money value={row.amount} />),
          },
        ]}
      />
      {order.note !== null && <p className="text-sm">Note: {order.note}</p>}
      {order.createdBy !== null && (
        <p className="text-ink-subtle text-xs">Ordered by {order.createdBy}</p>
      )}
      {canWrite && (
        <div className="no-print flex flex-wrap gap-3">
          <form action={setPurchaseOrderStatusAction.bind(null, order.id, 'CLOSED')}>
            <Button type="submit" tone="secondary">
              Close — nothing more is coming
            </Button>
          </form>
          <form action={setPurchaseOrderStatusAction.bind(null, order.id, 'CANCELLED')}>
            <Button type="submit" tone="ghost" className="text-danger">
              Cancel order
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
