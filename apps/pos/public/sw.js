// Minimal service worker — BUILD-PLAN.md §8; docs/runfiles/M16-offline.md.
//
// Installability only: a registered service worker with a fetch handler is
// what a browser checks before offering "Add to Home Screen." It does not
// cache the app shell — that needs a build-time precache manifest for
// Next's hashed chunks and RSC payloads (what next-pwa/serwist exist to
// generate), scoped to M18 alongside the Lighthouse pass it already owns
// (see the runfile's §2 Out: reloading, or navigating between routes, while
// offline is not yet possible). The offline queue and its replay live in the
// page itself (lib/offline/), not here, because the till's tab is expected
// to stay open for a shift rather than be backgrounded the way a mobile PWA
// is.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
