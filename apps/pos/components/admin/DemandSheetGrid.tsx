'use client';

import { useActionState, useState } from 'react';
import { ListChecks, Search } from 'lucide-react';
import { Button } from '@natech/ui';
import { addDemandLinesAction, type DemandActionState } from '@/lib/demand/actions';
import type { DemandCatalogueGroup } from '@/lib/demand/queries';

const IDLE: DemandActionState = { error: null, message: null };

/**
 * The standing checklist — M24, docs/runfiles/M24-demand-catalogue.md.
 *
 * This is the paper form. The manager walks the store with it, types a number
 * beside what needs buying, and submits once. Everything about the layout is
 * copied from the printed sheet on purpose: the four columns in their printed
 * order, the items in theirs, and the quantity box immediately to the right of
 * the name. A manager who knows the paper should not have to learn this.
 *
 * The boxes are uncontrolled and named `qty:<item id>`. Nothing is held in
 * React state, so typing into 144 inputs re-renders nothing — and the id, not
 * the name, is what identifies the row to the server.
 */
export function DemandSheetGrid({
  sheetId,
  groups,
}: {
  readonly sheetId: string;
  readonly groups: readonly DemandCatalogueGroup[];
}) {
  const [state, action, pending] = useActionState(addDemandLinesAction.bind(null, sheetId), IDLE);
  const [filter, setFilter] = useState('');

  const needle = filter.trim().toLowerCase();
  const shown = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.name.toLowerCase().includes(needle)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <form action={action} className="border-border bg-surface-raised rounded-base border p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-semibold">The list</h2>
          <p className="text-ink-muted text-sm">
            Type a quantity beside what you need. Leave the rest blank — only the boxes you fill in
            are added to the sheet.
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
            {pending ? 'Adding…' : 'Add filled items'}
          </Button>
        </div>
      </div>

      {/* The four printed columns side by side on a desk monitor, stacking on a
          phone. `items-start` so a short column does not stretch to match. */}
      <div className="grid items-start gap-x-6 gap-y-6 md:grid-cols-2 xl:grid-cols-4">
        {shown.map((group) => (
          <section key={group.category}>
            <h3 className="border-border text-ink-muted mb-1 border-b pb-1 text-xs font-semibold tracking-wide uppercase">
              {group.category}
            </h3>
            <ul>
              {group.items.map((item) => (
                <li
                  key={item.id}
                  className="border-border/60 hover:bg-surface-sunken flex items-center gap-2 border-b py-1"
                >
                  <label className="min-w-0 flex-1 truncate text-sm" htmlFor={`qty-${item.id}`}>
                    {item.name}
                    {item.defaultUnit !== null && (
                      <span className="text-ink-subtle"> ({item.defaultUnit})</span>
                    )}
                  </label>
                  <input
                    id={`qty-${item.id}`}
                    name={`qty:${item.id}`}
                    inputMode="decimal"
                    autoComplete="off"
                    aria-label={`Quantity of ${item.name}`}
                    className="border-border bg-surface min-h-touch w-16 shrink-0 rounded-base border px-2 text-end text-sm tabular-nums"
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {shown.length === 0 && (
        <p className="text-ink-muted py-6 text-center text-sm">
          Nothing on the list matches “{filter}”. Use the form below to add it as a one-off.
        </p>
      )}

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
