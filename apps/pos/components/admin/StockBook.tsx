'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button, DataTable, TextField } from '@natech/ui';
import { recordStockMovementAction, type StockActionState } from '@/lib/stock/actions';
import { showQty } from '@/lib/stock/ledger';
import type { StockRow } from '@/lib/stock/queries';

const IDLE: StockActionState = { error: null, message: null };
const SELECT = 'border-border bg-surface mt-1 min-h-touch w-full rounded-base border px-3';

/**
 * The stock book — ADR 0034, docs/runfiles/M28-stock-ledger.md.
 *
 * In, out and waste one line at a time. Counts are not on this form: they come
 * from the count sheet, which is how a walk-round actually happens.
 */
export function StockBook({
  rows,
  today,
  canWrite,
}: {
  readonly rows: readonly StockRow[];
  readonly today: string;
  readonly canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(recordStockMovementAction, IDLE);
  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLowerCase();
  const shown = rows.filter((row) => row.name.toLowerCase().includes(needle));
  const categories = [...new Set(rows.map((row) => row.category))];

  return (
    <div className="space-y-5">
      {canWrite && (
        <form action={action} className="border-border bg-surface-raised rounded-base border p-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">Record a movement</h2>
              <p className="text-ink-muted text-sm">
                Goods in, goods to the kitchen, or waste. Nothing can be issued or wasted below what
                the book shows — record the delivery or count it first.
              </p>
            </div>
            <Button type="submit" tone="primary" icon={Plus} disabled={pending}>
              {pending ? 'Saving…' : 'Record'}
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-sm font-medium">
              Item
              <select name="itemId" required defaultValue="" className={SELECT}>
                <option value="" disabled>
                  Choose…
                </option>
                {categories.map((category) => (
                  <optgroup key={category} label={category}>
                    {rows
                      .filter((row) => row.category === category)
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.name}
                          {row.unit === null ? '' : ` (${row.unit})`}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Movement
              <select name="kind" className={SELECT}>
                <option value="RECEIVED">Received</option>
                <option value="ISSUED">Issued to kitchen</option>
                <option value="WASTED">Wasted</option>
              </select>
            </label>
            <TextField name="qty" label="Quantity" inputMode="decimal" placeholder="0" required />
            <TextField
              name="unit"
              label="Unit"
              placeholder="kg, litre, piece"
              help="Only asked for the first time an item moves. Ignored once it has one."
              maxLength={32}
            />
            <TextField
              name="occurredOn"
              type="date"
              label="Date"
              defaultValue={today}
              max={today}
              required
            />
            <TextField name="note" label="Note" placeholder="Required for waste" maxLength={240} />
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

      <label className="relative block max-w-xs">
        <span className="sr-only">Find an item</span>
        <Search
          aria-hidden="true"
          className="text-ink-subtle pointer-events-none absolute top-1/2 start-2 size-4 -translate-y-1/2"
        />
        <input
          type="search"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Find an item"
          className="border-border bg-surface min-h-touch w-full rounded-base border py-1 pe-3 ps-8 text-sm"
        />
      </label>

      <DataTable
        rows={shown}
        getRowId={(row) => row.id}
        caption="On hand"
        emptyTitle="Nothing matches"
        // R16 — both counts are over the rows the table shows.
        summary={(visible) => (
          <span>
            {visible.length} items · {visible.filter((row) => row.onHand !== null).length} tracked
          </span>
        )}
        columns={[
          {
            key: 'name',
            header: 'Item',
            render: (row) => (
              <Link
                href={`/admin/stock/${row.id}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {row.name}
              </Link>
            ),
          },
          { key: 'category', header: 'List', secondary: true, render: (row) => row.category },
          {
            key: 'onHand',
            header: 'On hand',
            numeric: true,
            render: (row) =>
              row.onHand === null ? (
                <span className="text-ink-subtle">Not tracked</span>
              ) : (
                `${showQty(row.onHand)}${row.unit === null ? '' : ` ${row.unit}`}`
              ),
          },
          {
            key: 'last',
            header: 'Last movement',
            secondary: true,
            render: (row) => row.lastMovedOn ?? '—',
          },
        ]}
      />
    </div>
  );
}
