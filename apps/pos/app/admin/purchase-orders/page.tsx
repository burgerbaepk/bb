import Link from 'next/link';
import { FilePlus2 } from 'lucide-react';
import { can } from '@natech/contracts';
import { DataTable, Money } from '@natech/ui';
import { PageHeading } from '@/components/admin/PageHeading';
import { LinkButton } from '@/components/admin/purchasing/LinkButton';
import { requirePermissionPage } from '@/lib/auth/session';
import { readPurchaseOrders } from '@/lib/purchasing/queries';
import { PO_STATUS_LABEL } from '@/lib/purchasing/rules';

/**
 * Purchase orders — ADR 0035. Open ones first: they are the deliveries
 * somebody is waiting on.
 */
export default async function Page() {
  const viewer = await requirePermissionPage('reports.read');
  const rows = await readPurchaseOrders();
  return (
    <>
      <PageHeading
        title="Purchase orders"
        note="What has been ordered from suppliers and not yet billed. An order moves no stock and owes nothing; when the goods arrive, enter the supplier's bill against it and the order closes."
        actions={
          can(viewer, 'expenses.write') ? (
            <LinkButton href="/admin/purchase-orders/new" icon={FilePlus2}>
              New purchase order
            </LinkButton>
          ) : undefined
        }
      />
      <DataTable
        rows={rows}
        getRowId={(row) => row.id}
        caption="Purchase orders"
        emptyTitle="No purchase orders yet"
        columns={[
          {
            key: 'no',
            header: 'PO',
            render: (row) => (
              <Link href={`/admin/purchase-orders/${row.id}`} className="font-medium underline">
                #{row.poNo}
              </Link>
            ),
          },
          { key: 'supplier', header: 'Supplier', render: (row) => row.supplierName },
          { key: 'ordered', header: 'Ordered', render: (row) => row.orderedOn },
          {
            key: 'expected',
            header: 'Expected',
            secondary: true,
            render: (row) => row.expectedOn ?? '—',
          },
          { key: 'status', header: 'Status', render: (row) => PO_STATUS_LABEL[row.status] },
          { key: 'lines', header: 'Items', numeric: true, render: (row) => row.lineCount },
          {
            key: 'total',
            header: 'Agreed value',
            numeric: true,
            render: (row) => <Money value={row.expectedTotal} />,
          },
        ]}
      />
    </>
  );
}
