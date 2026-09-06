'use client';

import { useEffect, useRef, useState } from 'react';
import { Dialog, EmptyState, useToast } from '@natech/ui';
import type { Order, TrayOrder } from '@natech/contracts';
import { ActiveOrdersTray } from '@/components/tray/ActiveOrdersTray';
import { loadOrderDetailAction, loadOrdersQueueAction } from '@/lib/orders/actions';

/**
 * The booked-orders tray, opened from the order screen's own "Booked
 * Orders" button, in a dialog rather than a navigation — the cashier is
 * mid-cart and a route change would lose it.
 *
 * `ActiveOrdersTray` itself refreshes via `router.refresh()` (its own
 * poll and realtime hook), which re-fetches the *host route's* server props,
 * not this dialog's locally-fetched ones. So this polls independently
 * (`POLL_INTERVAL_MS`) — a known simplification (ponytail: a few seconds of
 * staleness on a void/check done from inside this dialog, not a live push;
 * upgrade to a shared refresh callback if that lag ever matters in practice).
 */
const POLL_INTERVAL_MS = 4_000;

export interface OrdersQueueDialogProps {
  readonly open: boolean;
  /** Increment after booking/saving so the closed dialog warms fresh data. */
  readonly refreshKey?: number | undefined;
  readonly onLoadOrder: (order: Order) => void;
  readonly onClose: () => void;
}

export function OrdersQueueDialog({
  open,
  refreshKey = 0,
  onLoadOrder,
  onClose,
}: OrdersQueueDialogProps) {
  const toast = useToast();
  const [orders, setOrders] = useState<readonly TrayOrder[]>([]);
  const [zones, setZones] = useState<readonly string[]>([]);
  const opening = useRef(false);
  // Starts true so the very first open shows "Loading…" rather than an empty
  // queue; later opens keep whatever this already fetched last time until
  // the fresh poll below replaces it, which is a fine tradeoff for skipping
  // a synchronous `setState` in the effect body.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const result = await loadOrdersQueueAction();
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        toast.show('error', result.error ?? 'Could not load the orders queue.');
        return;
      }
      setOrders(result.orders);
      setZones(result.zones);
    };

    // Warm once while the terminal is idle, and again immediately after an
    // order is booked. Opening the dialog then renders cached rows at once.
    void load();
    const timer = open ? setInterval(() => void load(), POLL_INTERVAL_MS) : undefined;
    return () => {
      cancelled = true;
      if (timer !== undefined) clearInterval(timer);
    };
  }, [open, refreshKey, toast]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Booked orders"
      className="h-[85vh] w-[min(72rem,calc(100vw-2rem))]"
    >
      <div className="-mx-5 -my-4 h-[calc(85vh-4.5rem)]">
        {loading && orders.length === 0 ? (
          <EmptyState title="Loading…" description="Fetching the active orders." />
        ) : (
          <ActiveOrdersTray
            orders={orders}
            zones={zones}
            autoRefresh={false}
            onLoadOrder={(picked) => {
              // Guards a double-click while the fetch below is in flight,
              // not a loading spinner — one order's detail is fast enough
              // that a visible pending state isn't worth the extra prop
              // plumbing into `OrderCard`.
              if (opening.current) return;
              opening.current = true;
              void loadOrderDetailAction(picked.orderId).then((result) => {
                opening.current = false;
                if (!result.ok || result.order === null) {
                  toast.show('error', result.error ?? 'Could not open that order.');
                  return;
                }
                onLoadOrder(result.order);
                onClose();
              });
            }}
          />
        )}
      </div>
    </Dialog>
  );
}
