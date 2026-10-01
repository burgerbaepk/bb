import Link from 'next/link';
import { can } from '@natech/contracts';
import { sum } from '@natech/domain';
import { DataTable, Money, StatCard } from '@natech/ui';
import { AccountForm } from '@/components/admin/accounts/AccountForm';
import { PageHeading } from '@/components/admin/PageHeading';
import { readAccounts, readCreditSales } from '@/lib/accounts/queries';
import { requirePermissionPage } from '@/lib/auth/session';
import { readCurrentBusinessDate } from '@/lib/outlet/queries';

/**
 * Credit customers and what each owes — ADR 0036.
 *
 * `reports.read` to read; opening an account is `staff.write` (owner-only),
 * recording a payment is `payment.take`, each checked again in its action.
 */
export default async function Page() {
  const viewer = await requirePermissionPage('reports.read');
  const today = await readCurrentBusinessDate();
  const [rows, monthCredit] = await Promise.all([
    readAccounts(),
    readCreditSales(`${today.slice(0, 8)}01`, today),
  ]);
  return (
    <>
      <PageHeading
        title="Credit customers"
        note="Customers allowed to pay later. A credit sale is a finalized, taxed invoice like any other; what was not paid at the counter is added here and settled when they pay. Walk-in customers never have an account."
      />
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard
            label="Owed by customers now"
            value={<Money value={sum(rows.map((row) => row.balance))} symbol="Rs." />}
          />
          <StatCard
            label="Sold on credit this month"
            value={<Money value={monthCredit} symbol="Rs." />}
          />
        </div>
        {can(viewer, 'staff.write') && <AccountForm />}
        <DataTable
          rows={rows}
          getRowId={(row) => row.id}
          caption="Accounts"
          emptyTitle="No credit accounts yet"
          emptyDescription="The owner opens one per customer allowed credit."
          // R16 — the total is summed from the rows it heads.
          summary={(visible) => (
            <span>
              Owed:{' '}
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
              header: 'Customer',
              render: (row) => (
                <div>
                  <Link href={`/admin/customers/${row.id}`} className="font-medium underline">
                    {row.name}
                  </Link>
                  {!row.isActive && <span className="text-ink-subtle"> (closed)</span>}
                  <p className="text-ink-subtle text-xs">{row.phone ?? ''}</p>
                </div>
              ),
            },
            {
              key: 'limit',
              header: 'Limit',
              numeric: true,
              secondary: true,
              render: (row) =>
                row.creditLimit === null ? 'None' : <Money value={row.creditLimit} />,
            },
            {
              key: 'last',
              header: 'Last paid',
              secondary: true,
              render: (row) => row.lastPaymentOn ?? '—',
            },
            {
              key: 'balance',
              header: 'Owes',
              numeric: true,
              render: (row) => <Money value={row.balance} emphasis="strong" />,
            },
          ]}
        />
      </div>
    </>
  );
}
