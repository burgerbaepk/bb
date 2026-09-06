'use client';

import { useActionState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, DataTable, Money, TextField } from '@natech/ui';
import { sum } from '@natech/domain';
import { createExpenseAction, deleteExpenseAction } from '@/lib/expenses/actions';
import type { ExpenseRow } from '@/lib/expenses/queries';

const IDLE = { error: null, message: null };
export function ExpenseManager({
  rows,
  today,
  canWrite,
}: {
  readonly rows: readonly ExpenseRow[];
  readonly today: string;
  readonly canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(createExpenseAction, IDLE);
  return (
    <div className="space-y-5">
      {canWrite && (
        <form action={action} className="border-border bg-surface-raised rounded-base border p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Record expense</h2>
              <p className="text-ink-muted text-sm">
                Cash purchases, utilities, supplies, repairs, payroll and other operating costs.
              </p>
            </div>
            <Button type="submit" tone="primary" icon={Plus} disabled={pending}>
              {pending ? 'Saving…' : 'Add expense'}
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <TextField
              name="incurredOn"
              type="date"
              label="Expense date"
              defaultValue={today}
              required
            />
            <TextField name="category" label="Category" placeholder="Utilities" required />
            <TextField
              name="amount"
              label="Amount (Rs.)"
              inputMode="decimal"
              placeholder="0.00"
              required
            />
            <label className="text-sm font-medium">
              Payment method
              <select
                name="paymentMethod"
                className="border-border bg-surface mt-1 min-h-touch w-full rounded-base border px-3"
              >
                <option value="">Not specified</option>
                <option>CASH</option>
                <option>CARD</option>
                <option>WALLET</option>
                <option>QR</option>
              </select>
            </label>
            <TextField name="vendor" label="Vendor" placeholder="Optional" />
            <TextField name="reference" label="Reference" placeholder="Invoice or voucher number" />
            <label className="text-sm font-medium md:col-span-2">
              Description
              <textarea
                name="description"
                required
                className="border-border bg-surface mt-1 min-h-24 w-full rounded-base border px-3 py-2"
              />
            </label>
          </div>
          {state.error && (
            <p role="alert" className="text-danger mt-3 text-sm">
              {state.error}
            </p>
          )}
          {state.message && (
            <p role="status" className="text-ok mt-3 text-sm">
              {state.message}
            </p>
          )}
        </form>
      )}
      <DataTable
        rows={rows}
        getRowId={(row) => row.id}
        caption="Expense ledger"
        summary={(visible) => (
          <span>
            {visible.length} expenses ·{' '}
            <Money value={sum(visible.map((row) => row.amount))} symbol="Rs." emphasis="strong" />
          </span>
        )}
        columns={[
          { key: 'date', header: 'Date', render: (row) => row.incurredOn },
          { key: 'category', header: 'Category', render: (row) => row.category },
          {
            key: 'description',
            header: 'Description',
            render: (row) => (
              <div>
                <p>{row.description}</p>
                <p className="text-ink-subtle text-xs">
                  {row.vendor ?? 'No vendor'}
                  {row.reference ? ` · ${row.reference}` : ''}
                </p>
              </div>
            ),
          },
          {
            key: 'method',
            header: 'Method',
            secondary: true,
            render: (row) => row.paymentMethod ?? '—',
          },
          {
            key: 'amount',
            header: 'Amount',
            numeric: true,
            render: (row) => <Money value={row.amount} emphasis="strong" />,
          },
          {
            key: 'actions',
            header: '',
            render: (row) =>
              canWrite ? (
                <form action={() => deleteExpenseAction(row.id)}>
                  <Button type="submit" size="sm" tone="ghost" icon={Trash2}>
                    Delete
                  </Button>
                </form>
              ) : null,
          },
        ]}
      />
    </div>
  );
}
