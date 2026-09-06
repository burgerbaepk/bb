# M09a · orders-kitchen

**Milestone:** M09a · **Phase:** 2 — Wiring
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §5.6, §10, §16, §2 R2/R4/R6/R7/R11/R12/R14
**Status:** complete
**Preceding gate:** [M08](./M08-menu-floor-brand.md) — passed

---

## 1. Purpose

M04 built the order screen and the kitchen display against mock data: `OrderScreen`,
`Cart`, `cartModel`, and `apps/kds`'s `StationRail`/`Ticket`/`AllDayRail` all
render, validate, and look correct, and an order taken on one never reaches a
kitchen screen. M09a is where that stops — a line added to a cart becomes a
real `order_lines` row, sending to kitchen becomes a real ticket on a real
rail, and a bump on that rail becomes something the POS could, in principle,
see happen. M06 already froze the exact shapes both ends read and write
(`Order`, `Ticket`, `StationBoard`), so this milestone is wiring and one new
piece of infrastructure, not new design.

It sits ahead of M09b (floor-live) and M10 (check-and-payment) because both
need a real order to attach to: a table session can't go `ORDERED` without one,
and a check can't estimate a subtotal that was never entered.

---

## 2. Scope

**In:**

- Order lifecycle (§5.6) wired to `OrderScreen`/`Cart`: create a draft order,
  add/remove/edit lines and modifiers (snapshotting name, price, and fiscal
  codes at add time, per §5.6 — a later menu edit must not move a number a
  guest has already been shown), apply an order-level discount, send to
  kitchen, void. Every transition validated server-side against the existing
  `orderMachine`/`kitchenMachine` state machines (`packages/domain`, built in
  M03, unused until now) — R4.
- Station routing: `order_lines.station_id` copied from the menu item's
  current station at add time, same snapshot reasoning as the fiscal codes.
- `apps/kds` wired to real `StationBoard` data: tickets, the all-day rail,
  bump (`PENDING → COOKING → READY`, bump-all on the ticket header), recall
  (restore the last bumped ticket for 90 seconds, `was_recall = true`), course
  firing (fire a course from the POS; lines above it sit `HELD` until then,
  gated on the already-seeded `kds.coursesEnabled` setting). Every transition
  writes a `kds_events` row.
- The KDS station token (§14.1: `KITCHEN` is "token-scoped", not
  permission-scoped like every other role) — carried forward from M07, which
  built every other actor's access and explicitly left this one, and from M08,
  which built every other screen `apps/kds` needs data from. Today
  `/station/[key]` takes a bare, unauthenticated station key; this milestone
  replaces it with a signed, per-station token minted from the back office.
- Realtime (§16): publish order/kitchen mutations to Upstash Redis, consumed
  by a Node-runtime SSE route in `apps/kds`, with the 3-second poll backstop
  and full-refetch-on-reconnect the plan requires. Scoped to the KDS only —
  the POS-side consumer (the active-orders tray) is M09b's, per that
  milestone's own line ("active-orders tray wired").
- R7 audit rows via `withAudit`/`writeAudit` for order/line mutations that
  aren't already covered by the dedicated `kds_events` table (§5.6's own
  event log covers the kitchen-status transitions; order-level create/void
  still needs the general audit trail).
- A kitchen-ticket template and the browser-print path (§12, path 3 — "80mm
  HTML plus browser print dialog, universal fallback"), triggered when an
  order is sent to kitchen and offered again as a manual reprint. R14 applies
  here exactly as it does to the KDS screen: no money anywhere on the ticket.

**Out:**

- The active-orders tray (§11) and everything live-floor (§9.3: SSE table
  states, seat/transfer/merge/split) — M09b, which needs this milestone's real
  orders to exist first but does its own wiring.
- Finalize, checks, payments, invoices (§5.7, §5.8, §6) — M10 and M11.
- The print-bridge agent and WebUSB/WebSerial fallback (§12 paths 1 and 2) — a
  signed, separately-deployed Node binary and Chrome-gesture-gated device
  pairing are each their own project, not something to design against unknown
  printer hardware inside this pass. The kitchen ticket **does** print by the
  end of this milestone (see §3), through §12's third path — 80mm HTML plus
  the browser print dialog — which needs no external agent or hardware
  pairing and is genuinely the fastest path to paper actually coming out of a
  printer. Paths 1 and 2 are carried forward.
- Offline replay (§8) — order creation gets a strong idempotency guarantee for
  free from `orders.client_order_uuid`'s unique index, but the general
  `withIdempotency()` machinery (R3) that a real offline queue needs is M16's.
- Web orders reaching the kitchen (§13.4's accept/reject flow) — M14.

---

## 3. Decisions

**The KDS token is a long-lived signed token, not a database-backed
session — settled in favour of operational speed.** `packages/auth`'s
existing `signToken`/`verifyToken` (built in M07 for three short-lived §14.2
purposes) gets a fourth purpose, `'kds-station'`, minted from the stations
screen (`StationsManager`, M08) as a "Copy KDS link" action carrying the
station id, TTL measured in years. A physical panel in a kitchen stays on
that link indefinitely, and a kitchen never has to re-authenticate a screen
mid-service. The accepted trade-off: revoking one compromised panel without
touching the others isn't possible — recovering from a leaked link means
rotating `AUTH_SECRET`, which invalidates every station's link at once and
means re-printing every QR/link in the kitchen. Acceptable for how rarely
that should ever need to happen, against how often "is this screen still
signed in" would otherwise come up.

**Realtime is built on `@upstash/realtime`** (the official SDK, confirmed
against its current docs and pinned at `1.1.0`, on top of `@upstash/redis`
`1.38.2` and this repo's existing `zod` `4.4.3` — no version conflicts),
rather than hand-rolling calls to Upstash's REST `/publish` and `/subscribe`
endpoints directly. It is HTTP-only end to end — built for exactly the
`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` pair this environment
has, with no `redis://` TCP connection string anywhere — and gives a
zod-typed event schema, an `.emit()` callable from any server action or route
handler in either app, a Node-runtime `handle()` for the SSE route, and a
`useRealtime()` client hook with server-side channel filtering (by station
id). A new shared `packages/realtime` package holds the schema once so
`apps/pos` (which emits, from order and kitchen actions) and `apps/kds`
(which emits from bump/recall/course-fire and subscribes for the live board)
cannot drift into two different event shapes. The wire event itself is
deliberately coarse — "something changed for this station" — not a diff; a
receiving panel refetches the board rather than trying to apply a partial
patch, which is what makes the plan's own 3-second poll backstop and
reconcile-on-reconnect trivially the same code path as a live update.

**Course firing is a POS action, not a KDS one.** §10.6 says "fire a course
from the POS" explicitly — the KDS bumps what's in front of it but doesn't
decide when the next course starts, which stays a floor decision.

**Kitchen-status transitions get `kds_events`, not the general `audit_log`.**
§5.6 gives them their own table with `from_status`/`to_status`/`was_recall` —
a shape `withAudit`'s generic `before`/`after` jsonb would flatten. Order-level
mutations (create, send to kitchen, void) still get a normal `writeAudit` row,
same as every other milestone.

---

## 4. What M09a found

**The channel-scoping trap in `@upstash/realtime`.** The bare `realtime.emit(event, data)` on the top-level instance and `realtime.channel(id).emit(event, data)` are not the same call with a convenience shortcut — confirmed by reading the SDK's actual source (`node_modules/.../@upstash/realtime/dist/server/realtime.js`), the top-level instance binds its own handlers to the hardcoded Redis channel `"default"` at construction (`Object.assign(this, this.createEventHandlers("default"))`), entirely separate from any named `.channel(id)`. `apps/kds`'s SSE route is reached with `?channel=<stationId>`, so a bare `.emit()` publishes to a channel nothing subscribes to — the event is silently swallowed, invisible until the 3-second poll backstop happens to catch it. The `apps/pos` build (following this runfile's own original wording, which only ever said "`.emit()`") used the bare form at all three of its call sites; the `apps/kds` build independently used the channel-scoped form. Caught by reading the SDK source directly after noticing the two builds disagreed, fixed at all three `apps/pos` call sites, and documented permanently in `packages/realtime/src/schema.ts`'s doc comment so the mistake doesn't recur. No test caught this — it is a wiring-level integration gap between two apps that neither app's own test suite can see, which is exactly why the fix belongs in the shared package's documentation, not just in the call sites.

**`@upstash/realtime/client`'s `useRealtime` hook needs a `RealtimeProvider`** that `packages/realtime/src/client.ts` does not re-export, and `@upstash/realtime` is not a direct dependency of `apps/kds` (only of `packages/realtime`, which does not hoist it across the workspace boundary the way a `apps/kds` `require.resolve` needs). `apps/kds` works around this with a raw `EventSource` against the same `/api/realtime` route, decoding the identical wire format `handle()` already writes. Functionally equivalent, confirmed live against the real Upstash-backed route, but the `packages/realtime` package doesn't yet deliver on its own promise of a ready-made client hook. Carried forward: re-export `RealtimeProvider` from `packages/realtime/src/client.ts` and mount it once in `apps/kds/app/layout.tsx`, then delete the `EventSource` workaround.

**The order state machine has no edge back to `IN_KITCHEN`** from `READY`, `SERVED`, `CHECK_PRINTED`, `FINALIZED`, or `VOIDED`. Multi-round sends (a table ordering mains, then dessert later) work correctly _while_ the order is still in an early-enough state, and are correctly refused — not silently forced through — once it has moved on. Whether that refusal is the right long-term behaviour (versus a new edge letting a served table reopen for a dessert round) is carried forward rather than decided inside this pass.

**`outlet_config` is unseeded on this dev branch.** Deliberate — §14.6 seeds it from `pnpm brand:init`'s prompts, not `pnpm db:seed` — and R12 forbids a fallback that guesses a real identity, so any code path that would need it fails loudly rather than fabricating a trading name. Nothing built in this milestone needs it (a kitchen ticket carries no outlet identity), so this was a check made in passing, not a blocker hit.

**`auth-attempts.test.ts` (M07, `packages/db`) fails on a pre-existing timing assumption**, unrelated to this milestone — confirmed neither M09a build touched `packages/auth/src/lockout.ts` or the test itself. `retryAfterSeconds` comes back `61` against an assertion of `<= 60` (`PIN_LOCKOUT.lockSeconds`), reproducible on every run against the live Neon branch, not intermittent. Left as found rather than fixed here — a security-lockout code path closed out in a prior, already-gated milestone deserves its own look rather than a drive-by change under this one's name.

---

## 5. Gate

| #   | Criterion                                                                                                                   | Verified by                                                                                                                                                                                                                                                                                                                                                                                                                       | Result                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| G1  | Every order/kitchen state transition is validated server-side against `orderMachine`/`kitchenMachine`, not only client-side | code review (`lib/orders/actions.ts`, `apps/kds/lib/kitchen/actions.ts` both call `.assert()`/throw `IllegalTransitionError`) + unit tests on the surrounding decision logic                                                                                                                                                                                                                                                      | **PASS**                                            |
| G2  | A line, price, and the three fiscal codes are snapshotted at add time — a later menu edit does not alter an open order      | code review — `order_lines` columns are written once at send time from the client's already-resolved values, never re-joined from `menu_items` afterward                                                                                                                                                                                                                                                                          | **PASS**                                            |
| G3  | No monetary field reaches `apps/kds` in any form (R14)                                                                      | code review — `StationBoard`/`Ticket` assembly (`lib/kitchen/board.ts`) selects no `Paisa`-shaped column; `SentTicket`/`SentTicketLine` (the printed-ticket shape) carry none either, by construction, not by omission                                                                                                                                                                                                            | **PASS**                                            |
| G4  | A KDS panel without a valid station token sees nothing for that station                                                     | live check — a running `apps/kds` dev server against the real Neon branch: garbage, wrong-purpose, expired, and unknown-station tokens all `notFound()`; a real token minted for one station loaded only that station's (empty) board                                                                                                                                                                                             | **PASS**                                            |
| G5  | Recall restores the last bumped ticket for exactly 90 seconds, marked `was_recall`                                          | unit tests (`apps/kds/lib/kitchen/status.test.ts`) — inclusive-both-ends window boundary, plus a guard (verified in `actions.ts`/`board.ts`) refusing recall if the line moved on since the bump being recalled                                                                                                                                                                                                                   | **PASS**                                            |
| G6  | Tickets sort by `sent_at` ascending and are never reordered, even when one goes overdue                                     | code review — `board.ts` sorts once after assembly and nothing downstream re-sorts                                                                                                                                                                                                                                                                                                                                                | **PASS**                                            |
| G7  | A bump/new-ticket event reaches an open KDS panel over SSE within the poll backstop's window even if the stream drops       | fixed mid-review (see §4's channel-scoping finding) then live-verified: a direct `realtime.channel(id).emit()` reaches a real `EventSource` connection against the live Upstash instance; the independent 3-second `setInterval` poll in `StationRail` is the backstop regardless                                                                                                                                                 | **PASS**                                            |
| G8  | R7 — an audit row for order create/void; a `kds_events` row for every kitchen-status transition                             | code review — every `orders`-level mutation ends in `writeAudit`; every `order_lines.kitchen_status` change, including a line's first appearance, writes one `kds_events` row                                                                                                                                                                                                                                                     | **PASS**                                            |
| G9  | Workspace green: typecheck, lint, test, build, gates, format, **and a real `pnpm dev` smoke pass through the actual forms** | `pnpm --filter pos build`, `pnpm --filter kds build`, `pnpm --filter pos/kds/realtime/auth lint`, `prettier --check` (one `--write` pass needed on 6 `apps/kds` files), all four `pnpm gates`, and `pnpm run ci`'s test suites — all green **except** the pre-existing, unrelated `auth-attempts.test.ts` timing failure (§4). Both builds ran their own live `pnpm dev` pass against the real Neon branch per their own reports. | **PASS**, with the one noted pre-existing exception |

---

## 6. Exit

- [x] All gate criteria pass, except the pre-existing `auth-attempts.test.ts` timing
      failure noted in §4 (unrelated to this milestone, left for a dedicated look)
- [x] No migration — §5.6 tables already existed from M02
- [x] `packages/contracts` untouched — the freeze holds
- [ ] **Next: M09b · floor-live**

### Carried forward

| Item                                                                                                                                | Milestone                                    |
| ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Re-export `RealtimeProvider` from `packages/realtime/src/client.ts`; delete `apps/kds`'s `EventSource` workaround once it's mounted | whenever `packages/realtime` is next touched |
| Whether the order machine should gain an edge back to `IN_KITCHEN` for a table reopening after `READY`/`SERVED`                     | product decision, not yet scheduled          |
| The pre-existing `auth-attempts.test.ts` timing failure (§4)                                                                        | unscheduled — not this milestone's           |
| The print-bridge agent and WebUSB/WebSerial fallback (§12 paths 1 and 2)                                                            | unscheduled                                  |
| Per-station KDS-token revocation, if ever needed (currently: rotate `AUTH_SECRET`, invalidating every station at once)              | unscheduled                                  |
| Live floor canvas — SSE, table states, seat/transfer/merge/split; the active-orders tray                                            | M09b                                         |
| Finalize, checks, payments, invoices                                                                                                | M10                                          |
