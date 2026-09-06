'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { PublicOrderStatus } from '@natech/contracts';
import { useWebOrdersRealtime } from '@/lib/realtime/useWebOrdersRealtime';
import { OrderStatus } from './OrderStatus';

const POLL_MS = 3000;

/**
 * The live half of `/order/[publicId]` — BUILD-PLAN.md §16.
 *
 * §16: "Poll every 3 seconds as a correctness backstop on every consumer.
 * Reconcile against a full fetch on every reconnect." `router.refresh()`
 * re-runs the server component for this route with fresh data — both the
 * realtime signal and the plain interval below call the identical function,
 * which is what makes them the same code path rather than two.
 */
export function LiveOrderStatus({ order }: { readonly order: PublicOrderStatus }) {
  const router = useRouter();

  /**
   * Nothing follows a rejection or a settled invoice — R5 forbids even the till
   * from touching a finalized one. Polling past that point is a request every
   * three seconds, from a phone the customer has put back in their pocket, for
   * a row that cannot change again.
   */
  const live = order.decision !== 'REJECTED' && order.status !== 'FINALIZED';

  useWebOrdersRealtime(() => {
    if (live) router.refresh();
  });

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [router, live]);

  return <OrderStatus order={order} />;
}
