'use client';

import { useEffect, useRef } from 'react';
import { FLOOR_CHANNEL } from '@natech/realtime/client';

/**
 * The floor/tray's live-update subscription — BUILD-PLAN.md §16;
 * docs/runfiles/M09b-floor-live.md §3.
 *
 * A raw `EventSource` against `/api/realtime`, subscribed to the single fixed
 * `FLOOR_CHANNEL`, rather than `@natech/realtime/client`'s `useRealtime` hook
 * (no `RealtimeProvider` is mounted in this app yet) — `useWebOrdersRealtime`
 * copies this same workaround for its own channel. Carried forward: re-export
 * `RealtimeProvider` from `packages/realtime/src/client.ts` and delete both
 * workarounds once it is.
 */
export function useFloorRealtime(onSignal: () => void, enabled = true): void {
  const onSignalRef = useRef(onSignal);
  useEffect(() => {
    onSignalRef.current = onSignal;
  });

  useEffect(() => {
    if (!enabled) return;
    // jsdom has no `EventSource` — the 3-second poll backstop wherever this
    // hook is used covers the gap.
    if (typeof EventSource === 'undefined') return;

    const source = new EventSource(`/api/realtime?channel=${encodeURIComponent(FLOOR_CHANNEL)}`);

    source.onmessage = (event: MessageEvent<string>) => {
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      // §16 — "reconcile against a full fetch on every reconnect": the
      // `connected` system event fires once per channel on every (re)connect.
      if (isConnectedFrame(payload)) {
        onSignalRef.current();
        return;
      }
      if (isFloorChangedFrame(payload)) {
        onSignalRef.current();
      }
    };

    return () => source.close();
  }, [enabled]);
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

interface FloorChangedFrame {
  readonly event: 'floor.changed';
}

function isFloorChangedFrame(payload: unknown): payload is FloorChangedFrame {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'event' in payload &&
    (payload as { event: unknown }).event === 'floor.changed'
  );
}
