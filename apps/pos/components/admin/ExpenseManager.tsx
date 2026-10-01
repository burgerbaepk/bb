'use client';

import { useActionState, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, DataTable, Money, TextField } from '@natech/ui';
import { sum } from '@natech/domain';
import { createExpenseAction, deleteExpenseAction } from '@/lib/expenses/actions';
import type { ExpenseRow } from '@/lib/expenses/queries';

const IDLE = { error: null, message: null };
const NEW_CATEGORY = '__new';
const SELECT_CLASS = 'border-border bg-surface mt-1 min-h-touch w-full rounded-base border px-3';

/**
 * M32 — the expense form, ordered by what is always needed (amount, category,
 * date) over what usually is not (vendor, reference, method, which fold away).
 * Category is a list of every category already used, so the usual case is a
 * pick, not a spelling; "New category…" opens a text box, and the server
 * (`resolveCategory`) still folds a typed duplicate into the existing one.
 */
export function ExpenseManager({
  rows,
  categories,
  today,
  canWrite,
}: {
  readonly rows: readonly ExpenseRow[];
  readonly categories: readonly string[];
  readonly today: string;
  readonly canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(createExpenseAction, IDLE);
  const [newCategory, setNewCategory] = useState(categories.length === 0);
  return (
    <div className="space-y-5">
      {canWrite && (
        <form action={action} className="border-border bg-surface-raised rounded-base border p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Record expense</h2>
              <p className="text-ink-muted text-sm">
                Amount and category are all that is needed. Influencer meals are added from the till
                automatically.
              </p>
            </div>
            <Button type="submit" tone="primary" icon={Plus} disabled={pending}>
              {pending ? 'Saving…' : 'Add expense'}
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <TextField
              name="amount"
              label="Amount (Rs.)"
              inputMode="decimal"
              placeholder="0.00"
              required
            />
            <div>
              {categories.length > 0 && (
                <label className="text-sm font-medium">
                  Category
                  <select
                    // Unnamed while a new one is being typed, so only the text box posts.
                    {...(newCategory ? {} : { name: 'category' })}
                    required
                    defaultValue=""
                    onChange={(event) => setNewCategory(event.target.value === NEW_CATEGORY)}
                    className={SELECT_CLASS}
                  >
                    <option value="" disabled>
                      Choose a category
                    </option>
                    {categories.map((category) => (
                      <option key={category}>{category}</option>
                    ))}
                    <option value={NEW_CATEGORY}>New category…</option>
                  </select>
                </label>
              )}
              {newCategory && (
                <TextField
                  name="category"
                  label={categories.length > 0 ? 'New category name' : 'Category'}
                  placeholder="Utilities"
                  className={categories.length > 0 ? 'mt-2' : undefined}
                  required
                />
              )}
            </div>
            <TextField
              name="incurredOn"
              type="date"
              label="Expense date"
              defaultValue={today}
              required
            />
            <TextField
              name="description"
              label="Description"
              placeholder="Optional — the category is used when blank"
              className="md:col-span-3"
            />
          </div>
          <details className="mt-4">
            <summary className="text-ink-muted cursor-pointer text-sm">
              More details — vendor, reference, payment method
            </summary>
            <div className="mt-3 grid gap-4 md:grid-cols-3">
              <TextField name="vendor" label="Vendor" placeholder="Optional" />
              <TextField
                name="reference"
                label="Reference"
                placeholder="Invoice or voucher number"
              />
              <label className="text-sm font-medium">
                Payment method
                <select name="paymentMethod" defaultValue="CASH" className={SELECT_CLASS}>
                  <option value="">Not specified</option>
                  <option>CASH</option>
                  <option>CARD</option>
                  <option>WALLET</option>
                  <option>QR</option>
                </select>
              </label>
            </div>
          </details>
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
              // ADR 0038 — booked by the till with its order; not deletable here.
              row.orderNo !== null ? (
                <span className="text-ink-subtle text-xs">Order #{row.orderNo}</span>
              ) : canWrite ? (
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
