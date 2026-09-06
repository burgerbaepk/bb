import type { Metadata } from 'next';
import { ActiveOrdersTray } from '@/components/tray/ActiveOrdersTray';
import { currentTillIdentity } from '@/lib/auth/session';
import { loadOrdersQueue } from '@/lib/orders/queries';

/**
 * The active-orders tray — BUILD-PLAN.md §11;
 * docs/runfiles/M09b-floor-live.md.
 *
 * Real data via `listTrayOrders`.
 */
export const metadata: Metadata = {
  title: 'Active orders',
  robots: { index: false, follow: false },
};

export default async function Page() {
  const identity = await currentTillIdentity();
  if (identity === null) return null;
  const { viewer } = identity;
  const { orders, zones } = await loadOrdersQueue(viewer);

  return (
    <div className="h-[calc(100dvh-3.5rem)]">
      <ActiveOrdersTray orders={orders} zones={zones} />
    </div>
  );
}
