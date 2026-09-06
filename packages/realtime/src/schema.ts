import { z } from 'zod';

/**
 * The realtime event schema — BUILD-PLAN.md §16.
 *
 * §16 asks for a poll-backstop-and-reconcile design, not a diff stream: "Poll
 * every 3 seconds as a correctness backstop on every consumer. Reconcile
 * against a full fetch on every reconnect." A wire event that carried a
 * partial state patch would need the exact same full-refetch path anyway,
 * the moment a panel reconnects or a message is dropped — so every event here
 * is deliberately just a wake-up signal naming what changed, never the
 * changed data itself. A receiver always re-reads the current state after
 * one arrives, which is also what makes the 3-second poll and a live event
 * the same code path rather than two.
 *
 * One schema, shared by every surface in `apps/pos` that emits or subscribes,
 * so they cannot drift into disagreeing about an event's shape.
 *
 * **Always emit through `realtime.channel(name).emit(...)`, never the bare
 * `realtime.emit(...)`.** They are not the same call with a convenience
 * shortcut — `@upstash/realtime`'s `Realtime` instance binds its own
 * top-level `.emit`/`.subscribe` to the literal Redis channel `"default"`
 * (`RealtimeBase`'s constructor: `Object.assign(this,
 * this.createEventHandlers("default"))`), entirely separate from any
 * `.channel(name)` instance — so a bare `.emit()` publishes to a channel
 * nothing in this product subscribes to, and the event is silently
 * swallowed, invisible until the 3-second poll backstop happens to catch it.
 * There is no "default" channel concept anywhere else in this codebase;
 * treat the bare form as a footgun the SDK exposes rather than a valid
 * alternative.
 */
export const realtimeSchema = {
  floor: {
    /**
     * §9.3/§11 — a table or an order changed: seat, transfer, merge, split,
     * mark clean, a table auto-advancing to `ORDERED`/`SERVED`, or an order
     * mutation the tray cares about. Carries nothing to apply as a patch — a
     * receiver always refetches. Published on the single fixed
     * `FLOOR_CHANNEL`, never per-table: CLAUDE.md's own framing is one
     * restaurant per deployment, so there is exactly one floor to watch.
     */
    changed: z.object({}),
  },
  webOrders: {
    /**
     * §13.4 — a web order was placed, accepted, or rejected. Same
     * wake-up-only shape as `floor.changed`: the storefront's
     * `/order/[publicId]` page and `apps/pos`'s web-order inbox both refetch
     * their own state (a single order by `publicId`; the whole inbox list)
     * rather than being handed a patch. One fixed channel, not one per order
     * or per customer — CLAUDE.md's framing is one restaurant per
     * deployment, so there is exactly one inbox's worth of web orders to
     * watch, the same reasoning `FLOOR_CHANNEL` already rests on.
     */
    changed: z.object({}),
  },
};

/** The one Redis channel every floor-plan and active-orders-tray panel subscribes to. */
export const FLOOR_CHANNEL = 'floor';
/** The one Redis channel the web-order inbox and every live order-status page subscribe to. */
export const WEB_ORDERS_CHANNEL = 'web-orders';
