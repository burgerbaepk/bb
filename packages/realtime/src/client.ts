'use client';

import { createRealtime } from '@upstash/realtime/client';
import type { RealtimeEvents } from './index';

export { FLOOR_CHANNEL, WEB_ORDERS_CHANNEL } from './schema';

/**
 * The client-side hook — BUILD-PLAN.md §16.
 *
 * A separate entry point (`@natech/realtime/client`) from the server one
 * deliberately: the server module constructs a `Redis` client from
 * `UPSTASH_REDIS_REST_TOKEN`, and a client component importing that module
 * even indirectly would bundle a secret into the browser. Next's `'use
 * client'` boundary does not save an import that crosses through a shared
 * module — this package draws the line as two files instead.
 */
export const { useRealtime } = createRealtime<RealtimeEvents>();
