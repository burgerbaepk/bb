import Link from 'next/link';
import { Search } from 'lucide-react';
import { Money } from '@natech/ui';
import type { InvoiceListRow } from '@/lib/invoices/queries';
import { PageHeading } from './PageHeading';
import { formatBusinessDate, formatDateTime } from '@/components/lib/format';

export function InvoiceRegister({
  rows,
  timezone,
  filters,
}: {
  readonly rows: readonly InvoiceListRow[];
  readonly timezone: string;
  readonly filters: { query: string; from: string; to: string };
}) {
  return (
    <>
      <PageHeading
        title="Invoices"
        note="Finalized invoice register. Open any invoice to review its financial record and print history."
      />
      <form className="border-border bg-surface-raised mb-4 grid gap-3 rounded-base border p-4 md:grid-cols-[1fr_auto_auto_auto]">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Search</span>
          <input
            className="border-border bg-surface w-full rounded-base border px-3 py-2"
            name="q"
            defaultValue={filters.query}
            placeholder="Invoice, order, customer or phone"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">From</span>
          <input
            className="border-border bg-surface rounded-base border px-3 py-2"
            type="date"
            name="from"
            defaultValue={filters.from}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">To</span>
          <input
            className="border-border bg-surface rounded-base border px-3 py-2"
            type="date"
            name="to"
            defaultValue={filters.to}
          />
        </label>
        <button
          className="bg-primary text-ink-inverse mt-auto flex items-center justify-center gap-2 rounded-base px-4 py-2"
          type="submit"
        >
          <Search className="size-4" />
          Find
        </button>
      </form>
      <div className="border-border overflow-x-auto rounded-base border">
        <table className="w-full text-sm">
          <thead className="bg-surface-sunken text-start">
            <tr>
              <th className="p-3">Invoice</th>
              <th className="p-3">Date</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Payment</th>
              <th className="p-3 text-end">Total</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-surface-sunken">
                <td className="p-3">
                  <Link
                    className="text-primary font-semibold underline-offset-2 hover:underline"
                    href={`/admin/invoices/${row.id}`}
                  >
                    {row.localNo}
                  </Link>
                  <span className="text-ink-subtle block text-xs">
                    Order #{row.orderNo} · {row.status}
                  </span>
                </td>
                <td className="p-3">
                  {formatBusinessDate(row.businessDate)}
                  <span className="text-ink-subtle block text-xs">
                    {formatDateTime(row.finalizedAt, timezone)}
                  </span>
                </td>
                <td className="p-3">{row.customerName ?? 'Walk-in Customer'}</td>
                <td className="p-3">{row.paymentMethods || '—'}</td>
                <td className="p-3 text-end font-semibold">
                  <Money value={row.grandTotal} symbol="Rs." />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="text-ink-muted p-8 text-center">No invoices match these filters.</p>
        )}
      </div>
      <p className="text-ink-subtle mt-2 text-xs">
        Showing the latest {rows.length} matching invoices, up to 100.
      </p>
    </>
  );
}
