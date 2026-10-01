import Link from 'next/link';
import { ReceiptText } from 'lucide-react';
import { can } from '@natech/contracts';
import { sum } from '@natech/domain';
import { DataTable, Money } from '@natech/ui';
import { PageHeading } from '@/components/admin/PageHeading';
import { LinkButton } from '@/components/admin/purchasing/LinkButton';
import { SupplierForm } from '@/components/admin/purchasing/SupplierForm';
import { requirePermissionPage } from '@/lib/auth/session';
import { readSuppliers } from '@/lib/purchasing/queries';

/**
 * The supplier register and what is owed to each — ADR 0035.
 *
 * `reports.read` to read; adding a supplier is `expenses.write` (owner or
 * manager, ADR 0037), checked again in the action.
 */
export default async function Page() {
  const viewer = await requirePermissionPage('reports.read');
  const rows = await readSuppliers();
  return (
    <>
      <PageHeading
        title="Suppliers"
        note="Who the restaurant buys from, and what it owes each of them: the opening balance, plus every posted bill, less every payment. Open a supplier for their statement and to record a payment."
        actions={
          can(viewer, 'expenses.write') ? (
            <LinkButton href="/admin/purchases/new" icon={ReceiptText}>
              Enter a bill
            </LinkButton>
          ) : undefined
        }
      />
      <div className="space-y-5">
        {can(viewer, 'expenses.write') && <SupplierForm />}
        <DataTable
          rows={rows}
          getRowId={(row) => row.id}
          caption="Suppliers"
          emptyTitle="No suppliers yet"
          emptyDescription="The owner adds suppliers here."
          // R16 — the total is summed from the rows it heads.
          summary={(visible) => (
            <span>
              Owed to suppliers:{' '}
              <Money
                value={sum(visible.map((row) => row.balance))}
                symbol="Rs."
                emphasis="strong"
              />
            </span>
          )}
          columns={[
            {
              key: 'name',
              header: 'Supplier',
              render: (row) => (
                <div>
                  <Link href={`/admin/suppliers/${row.id}`} className="font-medium underline">
                    {row.name}
                  </Link>
                  {!row.isActive && <span className="text-ink-subtle"> (inactive)</span>}
                  <p className="text-ink-subtle text-xs">
                    {[row.contactPerson, row.phone].filter(Boolean).join(' · ')}
                  </p>
                </div>
              ),
            },
            {
              key: 'billed',
              header: 'Billed',
              numeric: true,
              secondary: true,
              render: (row) => <Money value={row.billed} />,
            },
            {
              key: 'paid',
              header: 'Paid',
              numeric: true,
              secondary: true,
              render: (row) => <Money value={row.paid} />,
            },
            {
              key: 'balance',
              header: 'Balance owed',
              numeric: true,
              render: (row) => <Money value={row.balance} emphasis="strong" />,
            },
          ]}
        />
      </div>
    </>
  );
}
