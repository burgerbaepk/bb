import type { Metadata } from 'next';
import { currentTillIdentity } from '@/lib/auth/session';
import { readOutletTimezone } from '@/lib/outlet/queries';
import { readWebOrders } from '@/lib/webOrders/queries';
import { WebOrderInbox } from '@/components/weborders/WebOrderInbox';

/**
 * Web orders — BUILD-PLAN.md §13.4.
 *
 * A QR order arrives here and waits. It is never accepted automatically.
 */
export const metadata: Metadata = {
  title: 'Web orders',
  robots: { index: false, follow: false },
};

export default async function Page() {
  if ((await currentTillIdentity()) === null) return null;

  const [orders, timezone] = await Promise.all([readWebOrders(), readOutletTimezone()]);

  return (
    <div className="h-[calc(100dvh-3.5rem)]">
      <WebOrderInbox orders={orders} timezone={timezone} />
    </div>
  );
}
