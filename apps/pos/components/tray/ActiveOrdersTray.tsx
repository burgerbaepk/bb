'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { EmptyState, Money, SegmentedControl, Switch, useToast } from '@natech/ui';
import { paisa } from '@natech/domain';
import type { OrderType, TrayOrder } from '@natech/contracts';
import { voidOrderAction } from '@/lib/orders/actions';
import { useFloorRealtime } from '@/lib/realtime/useFloorRealtime';
import { OrderCard } from './OrderCard';
import { VoidOrderDialog } from './VoidOrderDialog';

/**
 * The booked-orders tray — BUILD-PLAN.md §11, R16, defects V6, V7, V8, C3, V1.
 *
 * Answers which booked order to pick back up. Loading an order is the only
 * route back into it — deliberately (2026-08-27): no payment action lives
 * here, that happens from the POS screen once the order is loaded.
 *
 * Four §11.2 requirements are structural here.
 *
 * **Order types are chips, not tiles.** An empty type costs a chip, not a third
 * of the viewport (V6) — Dine In/Takeaway/Delivery filter the same way channel
 * used to, just against `order.type` rather than `order.channel`, since that
 * is the distinction a waiter picking an order back up actually cares about.
 *
 * **The header derives from the rendered rows** (R16). `visible` is computed
 * once and both the count and the sum read from it, so a header claiming four
 * orders and Rs. 40,623.70 above three cards summing Rs. 34,161.30 is not
 * expressible (V1, C3).
 *
 * **Sort and filter exist at all**, over oldest, table, and value, plus zone and
 * state. The current tray is a fixed three-up grid with neither (V8).
 *
 * **Search is by table and order number**, not by amount. Searching the
 * queue "by amount" (V7) answers a question nobody in service is asking.
 */
type SortKey = 'OLDEST' | 'TABLE' | 'VALUE';
type StateFilter = 'ALL' | 'PLACED' | 'SERVED';

export interface ActiveOrdersTrayProps {
  readonly orders: readonly TrayOrder[];
  readonly zones: readonly string[];
  /** The queue dialog owns its own data refresh and must not refresh its host page too. */
  readonly autoRefresh?: boolean | undefined;
  /** Embedded queues can hydrate their host directly instead of navigating. */
  readonly onLoadOrder?: ((order: TrayOrder) => void) | undefined;
}

const POLL_INTERVAL_MS = 3_000;

export function ActiveOrdersTray({
  orders,
  zones,
  autoRefresh = true,
  onLoadOrder,
}: ActiveOrdersTrayProps) {
  const router = useRouter();
  const toast = useToast();
  const [type, setType] = useState<OrderType | 'ALL'>('ALL');
  const [stateFilter, setStateFilter] = useState<StateFilter>('ALL');
  const [sort, setSort] = useState<SortKey>('OLDEST');
  const [zone, setZone] = useState<string>('ALL');
  const [query, setQuery] = useState('');
  const [compact, setCompact] = useState(false);
  const [voiding, setVoiding] = useState<TrayOrder | null>(null);
  const [voidPending, setVoidPending] = useState(false);

  // §16 — poll backstop plus the live stream; both just mean "refetch".
  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, router]);
  useFloorRealtime(() => router.refresh(), autoRefresh);

  const visible = useMemo(() => {
    const filtered = orders.filter((order) => {
      if (type !== 'ALL' && order.type !== type) return false;
      if (zone !== 'ALL' && order.zoneName !== zone) return false;
      if (stateFilter === 'PLACED' && order.status !== 'PLACED') return false;
      if (stateFilter === 'SERVED' && order.status !== 'SERVED') return false;
      if (query.trim() !== '') {
        const needle = query.trim().toLowerCase();
        const haystack = `${order.tableCode ?? ''} ${order.orderNo} ${order.customerName ?? ''}`;
        if (!haystack.toLowerCase().includes(needle)) return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sort === 'TABLE') return (a.tableCode ?? '~').localeCompare(b.tableCode ?? '~');
      if (sort === 'VALUE') return Number(b.subtotalExTax - a.subtotalExTax);
      return b.elapsedSeconds - a.elapsedSeconds;
    });
  }, [orders, type, zone, stateFilter, query, sort]);

  // R16 — both header figures are functions of `visible`, the same array the
  // cards below are rendered from.
  const headerCount = visible.length;
  const headerSum = paisa(visible.reduce((total, order) => total + order.subtotalExTax, 0n));

  const typeCount = (candidate: OrderType) =>
    orders.filter((order) => order.type === candidate).length;

  return (
    <div className="flex h-full flex-col">
      <div className="border-border space-y-3 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            label="Filter by type"
            value={type}
            onChange={setType}
            options={[
              { value: 'ALL' as const, label: 'All', count: orders.length },
              { value: 'DINE_IN' as const, label: 'Dine-in', count: typeCount('DINE_IN') },
              { value: 'TAKE_AWAY' as const, label: 'Takeaway', count: typeCount('TAKE_AWAY') },
              { value: 'DELIVERY' as const, label: 'Delivery', count: typeCount('DELIVERY') },
            ]}
          />

          <label className="ms-auto flex min-w-48 items-center gap-2">
            <Search aria-hidden="true" className="text-ink-subtle size-4 shrink-0" />
            <span className="sr-only">Search by table, order number, or customer</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Table or order number"
              className="border-border bg-surface-raised min-h-touch w-full rounded-base border px-3 text-sm"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            size="sm"
            label="Filter by state"
            value={stateFilter}
            onChange={setStateFilter}
            options={[
              { value: 'ALL' as const, label: 'Any state' },
              { value: 'PLACED' as const, label: 'Placed' },
              { value: 'SERVED' as const, label: 'Served' },
            ]}
          />
          <SegmentedControl
            size="sm"
            label="Sort"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'OLDEST' as const, label: 'Oldest first' },
              { value: 'TABLE' as const, label: 'By table' },
              { value: 'VALUE' as const, label: 'By value' },
            ]}
          />
          <SegmentedControl
            size="sm"
            label="Filter by zone"
            value={zone}
            onChange={setZone}
            options={[
              { value: 'ALL', label: 'All zones' },
              ...zones.map((name) => ({ value: name, label: name })),
            ]}
          />
          <div className="ms-auto">
            <Switch
              checked={compact}
              onChange={setCompact}
              label="Compact density"
              onLabel="Compact"
              offLabel="Comfortable"
            />
          </div>
        </div>

        <p className="text-ink-muted text-sm">
          {/* R16 — both figures below are functions of `visible`. The data
              attribute exists so a test can read what the header actually
              rendered rather than what it was meant to render. */}
          <span data-tray-count={headerCount} className="text-ink font-semibold tabular-nums">
            {headerCount}
          </span>{' '}
          open
          {headerCount === 1 ? ' order' : ' orders'} ·{' '}
          <Money value={headerSum} symbol="Rs." emphasis="strong" label="Subtotal excluding tax" />{' '}
          subtotal (ex tax)
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {visible.length === 0 ? (
          <EmptyState
            title="No orders match"
            description="Clear a filter, or check the floor plan for tables that have not ordered yet."
          />
        ) : (
          <ul
            className={
              compact ? 'grid gap-3 md:grid-cols-2 2xl:grid-cols-3' : 'grid gap-4 xl:grid-cols-2'
            }
          >
            {visible.map((order) => (
              <li key={order.orderId}>
                <OrderCard
                  order={order}
                  compact={compact}
                  onLoad={(picked) =>
                    onLoadOrder === undefined
                      ? router.push(`/?orderId=${picked.orderId}`)
                      : onLoadOrder(picked)
                  }
                  onDelete={(picked) => setVoiding(picked)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <VoidOrderDialog
        order={voiding}
        pending={voidPending}
        onClose={() => setVoiding(null)}
        onConfirm={() => {
          if (voiding === null) return;
          setVoidPending(true);
          void voidOrderAction({ orderId: voiding.orderId }).then((result) => {
            setVoidPending(false);
            if (result.ok) {
              toast.show('success', `Order #${voiding.orderNo} voided`);
              setVoiding(null);
              router.refresh();
            } else {
              toast.show('error', result.error ?? 'Voiding failed.');
            }
          });
        }}
      />
    </div>
  );
}
