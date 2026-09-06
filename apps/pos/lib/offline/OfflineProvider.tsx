'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { OfflineState, QueuedOrder } from '@natech/contracts';
import { SyncResponseSchema } from '@natech/contracts';
import { computeOfflineState } from './queueLogic';
import {
  enqueueOrder,
  listQueuedOrders,
  readLastSyncAt,
  removeQueuedOrder,
  writeLastSyncAt,
  type QueuedOrderRecord,
} from './db';

/**
 * Real offline state for the whole till — BUILD-PLAN.md §8;
 * docs/runfiles/M16-offline.md §2.
 *
 * Replaces `PosShell`'s Phase-1 `SIMULATED_OFFLINE` switch: `navigator.onLine`
 * plus the `online`/`offline` events for the banner, a 60-second heartbeat
 * that replays the IndexedDB queue to `POST /api/sync/orders` while online
 * (§8's "on reconnect"), and `queueOrder()`/`nextOfflineCheckNo()` for
 * `OrderScreen` to call when a sale has to complete without a network.
 *
 * A page-context heartbeat, not the service worker's Background Sync API —
 * this runfile's §3 explains why (the till's tab is expected to stay open for
 * a shift, and Background Sync support is still inconsistent).
 */
const HEARTBEAT_MS = 60_000;

export interface OfflineContextValue {
  readonly state: OfflineState;
  readonly isOffline: boolean;
  readonly terminalId: string;
  readonly terminalLabel: string;
  readonly queueOrder: (order: QueuedOrder) => Promise<void>;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function useOffline(): OfflineContextValue {
  const value = useContext(OfflineContext);
  if (value === null) throw new Error('useOffline() must be called inside <OfflineProvider>.');
  return value;
}

/** Back-office consumers may render outside the till's queue provider. */
export function useOptionalOffline(): OfflineContextValue | null {
  return useContext(OfflineContext);
}

export interface OfflineProviderProps {
  readonly terminalId: string;
  readonly terminalLabel: string;
  readonly children: React.ReactNode;
}

function withoutQueuedAt(record: QueuedOrderRecord): QueuedOrder {
  const { queuedAt: _queuedAt, ...order } = record;
  return order;
}

function getOnlineSnapshot(): boolean {
  return navigator.onLine;
}

/**
 * The server has no `navigator`, and — this is the part that actually bit —
 * neither does a client's judgement of `navigator.onLine` reliably agree with
 * whatever the server rendered: captive portals, certain adapters/VPNs, and a
 * page served from the PWA's own cache while the network is briefly down can
 * all make a client's first read of `navigator.onLine` disagree with the `true`
 * the server has no choice but to assume. That is a real, observed hydration
 * mismatch, not a theoretical one. `true` here is the one value both the
 * server and the client's pre-hydration render can agree on unconditionally;
 * `useSyncExternalStore` swaps in the real value right after hydration, which
 * is a normal re-render rather than a hydration diff.
 */
function getServerOnlineSnapshot(): boolean {
  return true;
}

export function OfflineProvider({ terminalId, terminalLabel, children }: OfflineProviderProps) {
  const [queuedOrders, setQueuedOrders] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<Date>(() => new Date());
  const flushingRef = useRef(false);

  const refreshQueueCount = useCallback(async (): Promise<readonly QueuedOrderRecord[]> => {
    try {
      const queue = await listQueuedOrders();
      setQueuedOrders(queue.length);
      return queue;
    } catch {
      // No IndexedDB in this environment (an old browser, a privacy mode that
      // blocks it, or a component test with no polyfill) — the banner reads
      // an empty queue rather than crashing the till chrome around it.
      return [];
    }
  }, []);

  const flushQueue = useCallback(async (): Promise<void> => {
    if (flushingRef.current || !navigator.onLine) return;
    flushingRef.current = true;
    try {
      const queue = await refreshQueueCount();
      const first = queue[0];
      if (first === undefined) return;

      const queuedAtOldest = queue.reduce(
        (oldest, order) => (order.queuedAt < oldest ? order.queuedAt : oldest),
        first.queuedAt,
      );

      const response = await fetch('/api/sync/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          terminalId,
          queuedAtOldest,
          orders: queue.map(withoutQueuedAt),
        }),
      });
      if (!response.ok) return;

      const parsed = SyncResponseSchema.safeParse(await response.json());
      if (!parsed.success) return;

      for (const result of parsed.data.results) {
        if (result.accepted) await removeQueuedOrder(result.clientOrderUuid);
      }

      const now = new Date();
      await writeLastSyncAt(now);
      setLastSyncAt(now);
      await refreshQueueCount();
    } catch {
      // Offline again mid-flush, or the server did not answer — the queue is
      // untouched and the next heartbeat tries again. The banner already
      // shows the real queue depth and time since last sync; nothing else to
      // surface here.
    } finally {
      flushingRef.current = false;
    }
  }, [refreshQueueCount, terminalId]);

  /**
   * Fires an immediate flush attempt the moment the browser reports
   * reconnecting, ahead of the heartbeat below — the same thing the old
   * `handleOnline` did, just as `useSyncExternalStore`'s subscribe function.
   */
  const subscribeToOnlineStatus = useCallback(
    (onStoreChange: () => void) => {
      const handleOnline = () => {
        onStoreChange();
        void flushQueue();
      };
      const handleOffline = () => onStoreChange();
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    },
    [flushQueue],
  );
  const online = useSyncExternalStore(
    subscribeToOnlineStatus,
    getOnlineSnapshot,
    getServerOnlineSnapshot,
  );

  useEffect(() => {
    void (async () => {
      await refreshQueueCount();
      try {
        const stored = await readLastSyncAt();
        if (stored !== null) setLastSyncAt(stored);
      } catch {
        // Same fallback as `refreshQueueCount` — keep the mount-time default.
      }
    })();

    const heartbeat = window.setInterval(() => {
      if (navigator.onLine) void flushQueue();
    }, HEARTBEAT_MS);

    return () => window.clearInterval(heartbeat);
    // Deliberately mount-only: `flushQueue`/`refreshQueueCount` are stable
    // callbacks (see their own `useCallback` deps), and re-running this on
    // every render would leak one interval per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queueOrder = useCallback(
    async (order: QueuedOrder): Promise<void> => {
      await enqueueOrder(order, new Date());
      await refreshQueueCount();
      if (navigator.onLine) void flushQueue();
    },
    [flushQueue, refreshQueueCount],
  );

  const state = useMemo(
    () => computeOfflineState({ online, queuedOrders, lastSyncAt }),
    [online, queuedOrders, lastSyncAt],
  );

  const value = useMemo<OfflineContextValue>(
    () => ({ state, isOffline: !online, terminalId, terminalLabel, queueOrder }),
    [state, online, terminalId, terminalLabel, queueOrder],
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}
