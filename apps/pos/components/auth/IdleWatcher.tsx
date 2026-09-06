'use client';

import { useEffect, useRef } from 'react';
import { lockAction, touchIdentityAction } from '@/lib/auth/actions/session';

/**
 * The visible half of the §14.2 idle re-lock.
 *
 * "Re-lock on a configurable idle timeout." The enforcing half is in
 * `lib/auth/session.ts`, which measures the age of the signed cookie on every
 * request and refuses a stale one whatever the browser believes. This exists
 * because a till left unattended has to *look* locked, and a server-side check
 * that only fires on the next request leaves the last cashier's name on screen
 * over an open order until somebody touches it.
 *
 * So: the timer is the courtesy and the server is the rule. A cashier who
 * disables JavaScript gains a screen that stays lit and a session that still
 * refuses their next action.
 *
 * The same activity also has to refresh the cookie's own age server-side
 * (`touchIdentityAction`), throttled to `TOUCH_THROTTLE_MS` rather than fired
 * on every event — without it, the server's idle window runs from the last
 * PIN entry, not the last real action; a cashier mid-service for longer than
 * that window hits a flat, unexplained "till is locked" refusal on their next
 * print or finalize instead of ever seeing this screen, which reads exactly
 * like the re-lock never happening at all.
 */
export interface IdleWatcherProps {
  readonly idleLockSeconds: number;
}

/** Movement, not clicks — a cashier reading a ticket is not idle. */
const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/** Far below any sane `idleLockSeconds` — keeps the server cookie fresh without a round trip per keystroke. */
const TOUCH_THROTTLE_MS = 30_000;

export function IdleWatcher({ idleLockSeconds }: IdleWatcherProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTouch = useRef(0);

  useEffect(() => {
    if (idleLockSeconds <= 0) return;

    const lock = () => {
      void lockAction();
    };

    const restart = () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(lock, idleLockSeconds * 1000);

      const now = Date.now();
      if (now - lastTouch.current >= TOUCH_THROTTLE_MS) {
        lastTouch.current = now;
        // Best-effort: a rejection here just means the server already
        // considers the session stale, which `lock`/the next real action
        // will discover on their own.
        touchIdentityAction().catch(() => {});
      }
    };

    restart();
    for (const event of ACTIVITY) {
      window.addEventListener(event, restart, { passive: true });
    }

    // A tab restored from the background may have been asleep past the timeout
    // while its timer was throttled. Re-check on the way back rather than
    // trusting a clock the browser was free to stop.
    const onVisible = () => {
      if (document.visibilityState === 'visible') restart();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      for (const event of ACTIVITY) window.removeEventListener(event, restart);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [idleLockSeconds]);

  return null;
}
