'use client';

import { useEffect } from 'react';

/**
 * Registers the installability-only service worker — BUILD-PLAN.md §8.
 * See `public/sw.js`'s own doc comment for exactly what it does and does not
 * do. Mounted once, in the root layout — `null` render, side effect only.
 */
export function ServiceWorkerRegister(): null {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js');
    }
  }, []);
  return null;
}
