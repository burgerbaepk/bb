import Link from 'next/link';
import { ArrowUpRight, UtensilsCrossed } from 'lucide-react';
import { EmptyState, Money } from '@natech/ui';
import { formatQty } from '@/components/lib/format';
import type { TopItemRow } from '@/lib/dashboard/queries';

/**
 * Top products — BUILD-PLAN.md §17, §2 R16, defect C4.
 *
 * C4 is the reason this card is written the way it is: the system this
 * replaces has a "Popular Items" panel listing dishes that are not on the menu,
 * because it was shipped with its mock data still in it. Nothing here has a
 * fallback list, a placeholder row, or a default name — with no sales the card
 * says so, and the `mock-data-grep` gate is the structural half of the same
 * promise.
 *
 * The bar is scaled against the leader in the list, not against total sales.
 * A share of total would have to divide line-level net sales by an invoice
 * total that also carries order-level discounts and service charge, and the
 * percentage would be quietly wrong in a way nobody could spot on a card. What
 * a manager reads off this panel is the ranking and the gap between places,
 * and a bar against the leader states exactly that and nothing more (R16).
 */
export interface TopItemsProps {
  readonly rows: readonly TopItemRow[];
  readonly days: number;
}

export function TopItems({ rows, days }: TopItemsProps) {
  const leader = rows.reduce((max, row) => (row.netSales > max ? row.netSales : max), 0n);

  return (
    <section className="border-border bg-surface-raised rounded-base border p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold tracking-tight">Top products</h2>
          <p className="text-ink-muted text-sm">Best sellers over the last {days} days.</p>
        </div>
        <Link
          href="/admin/reports/sales"
          className="text-ink-muted hover:text-ink flex shrink-0 items-center gap-1 text-sm font-medium"
        >
          Full report <ArrowUpRight className="size-4" />
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="Nothing sold yet"
          description={`No items sold in the last ${days} days.`}
        />
      ) : (
        <ol className="space-y-3">
          {rows.map((row, index) => (
            <li key={`${row.itemName} ${row.categoryName}`}>
              <div className="flex items-baseline gap-3">
                <span className="text-ink-subtle w-4 shrink-0 text-sm tabular-nums">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{row.itemName}</p>
                  <p className="text-ink-subtle text-xs">
                    {row.categoryName} · {formatQty(row.qtySold)} sold
                  </p>
                </div>
                <Money value={row.netSales} emphasis="strong" className="text-sm" />
              </div>
              <div
                aria-hidden="true"
                className="bg-surface-sunken mt-1.5 ms-7 h-1 overflow-hidden rounded-full"
              >
                <div
                  className="bg-primary/70 h-full rounded-full"
                  style={{
                    width: `${leader === 0n ? 0 : Number((row.netSales * 1000n) / leader) / 10}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
