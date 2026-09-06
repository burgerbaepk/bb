import 'server-only';
import { Redis } from '@upstash/redis';
import { Realtime, type InferRealtimeEvents } from '@upstash/realtime';
import { realtimeSchema } from './schema';

export { FLOOR_CHANNEL, WEB_ORDERS_CHANNEL } from './schema';

/**
 * The server-side realtime instance — BUILD-PLAN.md §16.
 *
 * `@upstash/realtime` is HTTP-only end to end, built on `@upstash/redis`'s
 * REST client — the right fit for `UPSTASH_REDIS_REST_URL`/
 * `UPSTASH_REDIS_REST_TOKEN`, the pair this deployment has. There is no
 * `redis://` TCP connection string anywhere in this environment, which rules
 * out a conventional `ioredis`/node-redis `SUBSCRIBE` — that needs a held-open
 * socket a serverless function doesn't have. `.emit()` is callable from any
 * server action or route handler; `handle()` (re-exported below) is the
 * Node-runtime SSE route.
 */

function env(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} is not set. See BUILD-PLAN.md §4.`);
  }
  return value;
}

function createRealtime() {
  const redis = new Redis({
    url: env('UPSTASH_REDIS_REST_URL'),
    token: env('UPSTASH_REDIS_REST_TOKEN'),
  });
  return new Realtime({ schema: realtimeSchema, redis });
}

type RealtimeInstance = ReturnType<typeof createRealtime>;

let instance: RealtimeInstance | undefined;

/** Lazily create the client so framework builds do not require runtime secrets. */
export function getRealtime(): RealtimeInstance {
  if (instance === undefined) {
    instance = createRealtime();
  }
  return instance;
}

export type RealtimeEvents = InferRealtimeEvents<RealtimeInstance>;

export { handle } from '@upstash/realtime';
