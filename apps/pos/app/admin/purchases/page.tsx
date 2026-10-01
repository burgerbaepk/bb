import Link from 'next/link';
import { CalendarDays, ReceiptText } from 'lucide-react';
import { can } from '@natech/contracts';
import { sum } from '@natech/domain';
import { Button, DataTable, Money, StatCard, TextField } from '@natech/ui';
import { PageHeading } from '@/components/admin/PageHeading';
import { LinkButton } from '@/components/admin/purchasing/LinkButton';
import { requirePermissionPage } from '@/lib/auth/session';
import { readCurrentBusinessDate } from '@/lib/outlet/queries';
import { readBills, readPurchaseSummary, readSuppliers } from '@/lib/purchasing/queries';
import { showQty } from '@/lib/stock/ledger';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Supplier bills and the purchase report — ADR 0035.
 *
 * The range defaults to this month. Purchases are posted bills by bill date;
 * cancelled bills are listed (marked) but counted nowhere. "Owed now" is
 * every supplier's balance today, whatever the range, because a payable does
 * not stop being owed at the end of a month.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requirePermissionPage('reports.read');
  const today = await readCurrentBusinessDate();
  const query = await searchParams;
  const fromParam = query['from'];
  const toParam = query['to'];
  const from =
    typeof fromParam === 'string' && DATE.test(fromParam) ? fromParam : `${today.slice(0, 8)}01`;
  const to = typeof toParam === 'string' && DATE.test(toParam) && toParam >= from ? toParam : today;

  const [bills, summary, suppliers] = await Promise.all([
    readBills(from, to),
    readPurchaseSummary(from, to),
    readSuppliers(),
  ]);
  const purchased = sum(summary.bySupplier.map((row) => row.total));

  return (
    <>
      <PageHeading
        title="Purchases"
        note="Supplier bills, and what was bought by supplier and by item. A posted bill adds to what is owed and puts its goods into stock; a cancelled one does neither."
        actions={
          can(viewer, 'expenses.write') ? (
            <LinkButton href="/admin/purchases/new" icon={ReceiptText}>
              Enter a bill
            </LinkButton>
          ) : undefined
        }
      />
      <div className="space-y-5">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <TextField name="from" type="date" label="From" defaultValue={from} max={today} />
          <TextField name="to" type="date" label="To" defaultValue={to} max={today} />
          <Button type="submit" tone="secondary" icon={CalendarDays}>
            Show
          </Button>
        </form>

        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Purchased in range" value={<Money value={purchased} symbol="Rs." />} />
          <StatCard
            label="Paid to suppliers in range"
            value={<Money value={summary.paid} symbol="Rs." />}
          />
          <StatCard
            label="Owed to suppliers now"
            value={<Money value={sum(suppliers.map((row) => row.balance))} symbol="Rs." />}
          />
        </div>

        <DataTable
          rows={summary.bySupplier}
          getRowId={(row) => row.supplierId}
          caption="By supplier"
          emptyTitle="Nothing bought in this range"
          columns={[
            {
              key: 'name',
              header: 'Supplier',
              render: (row) => (
                <Link href={`/admin/suppliers/${row.supplierId}`} className="underline">
                  {row.name}
                </Link>
              ),
            },
            { key: 'bills', header: 'Bills', numeric: true, render: (row) => row.bills },
            {
              key: 'total',
              header: 'Purchased',
              numeric: true,
              render: (row) => <Money value={row.total} emphasis="strong" />,
            },
          ]}
        />

        <DataTable
          rows={summary.byItem}
          getRowId={(row) => row.itemId}
          caption="By item — goods value, before the bills' charges and discounts"
          emptyTitle="Nothing bought in this range"
          columns={[
            {
              key: 'name',
              header: 'Item',
              render: (row) => (
                <Link href={`/admin/stock/${row.itemId}`} className="underline">
                  {row.name}
                </Link>
              ),
            },
            { key: 'category', header: 'Category', secondary: true, render: (row) => row.category },
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
              render: (row) => <Money value={row.amount} />,
            },
          ]}
        />

        <DataTable
          rows={bills}
          getRowId={(row) => row.id}
          caption="Bills"
          emptyTitle="No bills in this range"
          columns={[
            {
              key: 'no',
              header: 'Bill',
              render: (row) => (
                <Link href={`/admin/purchases/${row.id}`} className="font-medium underline">
                  #{row.billNo}
                </Link>
              ),
            },
            { key: 'date', header: 'Date', render: (row) => row.billedOn },
            {
              key: 'supplier',
              header: 'Supplier',
              render: (row) => (
                <div>
                  <p>{row.supplierName}</p>
                  {row.supplierRef !== null && (
                    <p className="text-ink-subtle text-xs">Their invoice {row.supplierRef}</p>
                  )}
                </div>
              ),
            },
            {
              key: 'due',
              header: 'Due',
              secondary: true,
              render: (row) => row.dueOn ?? '—',
            },
            {
              key: 'total',
              header: 'Total',
              numeric: true,
              render: (row) =>
                row.status === 'CANCELLED' ? (
                  <span className="text-ink-subtle">
                    <s>
                      <Money value={row.total} />
                    </s>{' '}
                    cancelled
                  </span>
                ) : (
                  <Money value={row.total} emphasis="strong" />
                ),
            },
          ]}
        />
      </div>
    </>
  );
}
