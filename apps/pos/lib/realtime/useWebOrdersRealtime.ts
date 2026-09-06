'use client';

import { useEffect, useRef } from 'react';
import { WEB_ORDERS_CHANNEL } from '@natech/realtime/client';

/**
 * The web-order inbox's live-update subscription — BUILD-PLAN.md §16;
 * docs/runfiles/M14-storefront.md.
 *
 * A straight copy of `useFloorRealtime.ts`'s own `EventSource` workaround —
 * see that file's doc comment for why a raw `EventSource` against
 * `/api/realtime` is used here rather than `@natech/realtime/client`'s
 * `useRealtime` hook (no `RealtimeProvider` is mounted in any of the three
 * apps yet). Carried forward there and here alike.
 */
export function useWebOrdersRealtime(onSignal: () => void): void {
  const onSignalRef = useRef(onSignal);
  useEffect(() => {
    onSignalRef.current = onSignal;
  });

  useEffect(() => {
    if (typeof EventSource === 'undefined') return;

    const source = new EventSource(
      `/api/realtime?channel=${encodeURIComponent(WEB_ORDERS_CHANNEL)}`,
    );

    source.onmessage = (event: MessageEvent<string>) => {
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (isConnectedFrame(payload) || isWebOrdersChangedFrame(payload)) {
        onSignalRef.current();
      }
    };

    return () => source.close();
  }, []);
}

interface ConnectedFrame {
  readonly type: 'connected';
}

function isConnectedFrame(payload: unknown): payload is ConnectedFrame {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'type' in payload &&
    (payload as { type: unknown }).type === 'connected'
  );
}

interface WebOrdersChangedFrame {
  readonly event: 'webOrders.changed';
}

function isWebOrdersChangedFrame(payload: unknown): payload is WebOrdersChangedFrame {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'event' in payload &&
    (payload as { event: unknown }).event === 'webOrders.changed'
  );
}
