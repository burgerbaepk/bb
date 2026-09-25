'use client';

import { useActionState, useState } from 'react';
import { ListChecks, Search } from 'lucide-react';
import { Button, cn } from '@natech/ui';
import { recordStockCountAction, type StockActionState } from '@/lib/stock/actions';
import { showQty } from '@/lib/stock/ledger';
import type { StockRow } from '@/lib/stock/queries';

const IDLE: StockActionState = { error: null, message: null };

/**
 * The count sheet — ADR 0034, docs/runfiles/M28-stock-ledger.md.
 *
 * The demand checklist's layout (M24), because it is the same walk-round of
 * the same store: four printed columns, a box beside each name. Two
 * differences, both deliberate:
 *
 * - **0 is a count.** Blank means not counted; 0 means the shelf is empty.
 * - **Filtering hides, it does not unmount.** A manager who searches for
 *   "oil" halfway down the list must not lose the forty boxes already filled.
 *
 * The book is shown beside each box so a big variance is visible before the
 * save, not after. The manager is counting the shelf, not the screen; if that
 * tempts anybody to copy the book into the box, the variance column on the
 * item's history is where it shows.
 */
export function StockCountSheet({ rows }: { readonly rows: readonly StockRow[] }) {
  const [state, action, pending] = useActionState(recordStockCountAction, IDLE);
  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLowerCase();
  const categories = [...new Set(rows.map((row) => row.category))];

  return (
    <form action={action} className="border-border bg-surface-raised rounded-base border p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-semibold">Count sheet</h2>
          <p className="text-ink-muted text-sm">
            Type what is on the shelf. Leave an item blank if you did not count it; type 0 if there
            is none. Items without a unit ask for one.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="relative">
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
              className="border-border bg-surface min-h-touch rounded-base border py-1 pe-3 ps-8 text-sm"
            />
          </label>
          <Button type="submit" tone="primary" icon={ListChecks} disabled={pending}>
            {pending ? 'Saving…' : 'Save count'}
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-x-6 gap-y-6 md:grid-cols-2 xl:grid-cols-4">
        {categories.map((category) => (
          <section key={category}>
            <h3 className="border-border text-ink-muted mb-1 border-b pb-1 text-xs font-semibold tracking-wide uppercase">
              {category}
            </h3>
            <ul>
              {rows
                .filter((row) => row.category === category)
                .map((row) => (
                  <li
                    key={row.id}
                    className={cn(
                      'border-border/60 flex items-center gap-2 border-b py-1',
                      !row.name.toLowerCase().includes(needle) && 'hidden',
                    )}
                  >
                    <label className="min-w-0 flex-1 text-sm" htmlFor={`count-${row.id}`}>
                      <span className="block truncate">{row.name}</span>
                      <span className="text-ink-subtle block text-xs">
                        Book:{' '}
                        {row.onHand === null
                          ? 'not tracked'
                          : `${showQty(row.onHand)}${row.unit === null ? '' : ` ${row.unit}`}`}
                      </span>
                    </label>
                    {row.unit === null && (
                      <input
                        name={`unit:${row.id}`}
                        placeholder="unit"
                        maxLength={32}
                        autoComplete="off"
                        aria-label={`Unit for ${row.name}`}
                        className="border-border bg-surface min-h-touch w-16 shrink-0 rounded-base border px-2 text-sm"
                      />
                    )}
                    <input
                      id={`count-${row.id}`}
                      name={`count:${row.id}`}
                      inputMode="decimal"
                      autoComplete="off"
                      aria-label={`Count of ${row.name}`}
                      className="border-border bg-surface min-h-touch w-16 shrink-0 rounded-base border px-2 text-end text-sm tabular-nums"
                    />
                  </li>
                ))}
            </ul>
          </section>
        ))}
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
  );
}
