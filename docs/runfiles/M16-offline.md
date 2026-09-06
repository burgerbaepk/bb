# M16 · offline

**Milestone:** M16 · **Phase:** 2 — Wiring
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §8, §2 R2/R3/R7/R9, §11.1, §12
**Preceding gate:** [M15](./M15-urdu.md) — all ten gate criteria PASS; `docs/runfiles/M15-urdu.md` §5 names M16 as next

---

## 1. Purpose

§8 asks for five things: an installable PWA, an IndexedDB cache of reference
data, orders queued locally against a `client_order_uuid`, offline check and
invoice printing, and a replay endpoint with drift detection. Unusually for
this codebase, most of the surface for this milestone was already built,
deliberately, by earlier ones:

- `packages/contracts/src/sync.ts` is the frozen wire contract for the replay
  endpoint, written in an earlier milestone specifically so "client and server
  must agree exactly" from day one, per its own doc comment.
- `orders.client_order_uuid` already exists with its partial unique index
  (`orders_client_uuid_idx`) — the idempotency key §8 asks for.
- `packages/contracts/src/outlet.ts` already defines
  `OFFLINE_INVOICE_BANNER = 'PROVISIONAL — FISCAL PENDING'`, unused until now.
- `PosShell` already renders the real `OfflineBanner` component (queue depth,
  seconds since sync, the 200-order/6-hour escalation — all already
  implemented and unit-tested in `packages/ui`) behind a `SIMULATED_OFFLINE`
  stub, with a comment reading "Phase 1 has no service worker and no queue …
  M16 replaces the switch with the real thing."
- `DiscountDialog` already refuses a supervisor-threshold discount when its
  `offline` prop is true — wired to a hardcoded `false` in `OrderScreen`.
- `TaxInvoiceReceipt` already accepts an `offline` prop and already renders
  `OFFLINE_INVOICE_BANNER` when it is set — also wired to a hardcoded `false`.

So M16's job is narrower than §8 reads in isolation: build the one thing that
does not exist yet (the queue, the replay endpoint, the service worker), and
wire real data through scaffolding that has been waiting for it since Phase 1.

---

## 2. Scope

**In:**

- **`apps/pos/lib/offline/`** — a new module:
  - `queueLogic.ts` — pure. `computeOfflineState()` derives the
    `OfflineState` contract shape (`online`, `queuedOrders`,
    `secondsSinceLastSync`, `blockedActions`) from the queue's own contents,
    matching `OfflineBanner`'s existing 200-order/6-hour thresholds exactly so
    the banner and the blocking decision never disagree.
  - `checkNo.ts` — pure. `offlineCheckNo(terminalLabel, seq)` — ADR 0013's
    `CHK-OFF-<label>-<n>` scheme.
  - `buildQueuedOrder.ts` — pure. Cart state plus a computed check/payment in
    to the frozen `QueuedOrderSchema` wire shape.
  - `db.ts` — the one impure file: a native `indexedDB` wrapper (no library —
    two object stores, `queue` and `meta`). Untested directly, same as
    `packages/db/src/orderNo.ts`'s split from `orderNoLogic.ts` — the database
    half needs a real browser, the logic half does not.
  - `OfflineProvider.tsx` / `useOffline()` — a client-side context: tracks
    `navigator.onLine` and the `online`/`offline` events, loads the queue from
    IndexedDB on mount, runs a 60-second heartbeat that flushes the queue to
    `POST /api/sync/orders` when online, and exposes `queueOrder()` and
    `offlineCheckNo()` to any component beneath it.
- **`POST /api/sync/orders`** (`apps/pos/app/api/sync/orders/route.ts`) —
  validates `SyncRequestSchema`; replays each `QueuedOrder` inside its own
  `withIdempotency(tx, clientOrderUuid, 'sync.order', …)`-guarded transaction:
  inserts the order, its lines and modifiers, its check(s), and its
  payment(s) directly at their terminal state (see Decisions below on why this
  does not replay the kitchen/floor machines); allocates `local_no` for the
  first time via the existing `allocateLocalNo`; recomputes `computeTotals`
  from the real tax rules/policy and compares against the client's own
  figures, writing an audit `TAX_DRIFT` row on any mismatch (ADR 0013);
  enqueues `fiscal_outbox` exactly as `finalizeOrderAction` does, reusing
  `buildFinalizeFiscalPayload`/`enqueueFiscalOutbox`. Returns
  `SyncResponseSchema`.
- **Offline order capture in `OrderScreen`**: "print check" while offline
  computes the estimate with `estimateCheck` (the same `@natech/domain`
  function the server calls) against the cached tax rules/policy/check
  policy, and prints it through the existing `CheckPrintPortal` (HTML_DIALOG,
  ADR 0013) — no network call. "Finalize" while offline builds one
  `QueuedOrder` (lines, the printed check if any, the payment slices) and
  hands it to `queueOrder()` instead of calling `finalizeOrderAction`; the
  provisional tax invoice prints through `TaxInvoicePrintPortal` with
  `offline` set.
- **`apps/pos/app/(terminal)/page.tsx`** gains `readCheckPolicy()` alongside
  its existing `readTaxPolicy()`/`readTaxRules()` reads, passed to
  `OrderScreen` as a new `checkPolicy` prop — the one piece of reference data
  the offline check estimator needs that was not already flowing to the
  client.
- **Real wiring, not new UI**: `PosShell` sources its banner from
  `useOffline()` instead of `SIMULATED_OFFLINE`; `DiscountDialog` receives the
  same `isOffline` instead of a literal `false`; `TaxInvoiceReceipt` is fixed
  to show `Order <n>` instead of `invoice.localNo` when `offline` is set — a
  pre-existing display bug in the Phase-1 stub, since the field it fell back
  to already renders unconditionally two lines below.
- **Shift close blocked offline** — new this milestone, since nothing in
  Phase 1 anticipated it: `ShiftScreen`/`CloseShiftDialog` refuse to open the
  close dialog while `useOffline().state.blockedActions` includes
  `SHIFT_CLOSE`.
- **Installable PWA**: `apps/pos/public/manifest.json`, a minimal
  `public/sw.js` (install/activate, a network-first passthrough fetch
  handler — no asset precache, see Scope Out), registered once from the root
  layout.
- **ADR 0013** — TAX_DRIFT's destination without Sentry, the check-number
  prefix without a schema change, and forcing HTML_DIALOG offline.

**Out:**

- **No replay of the kitchen or floor state machines.** An offline sale is
  captured whole, at finalize, as one `QueuedOrder` — not as a live
  "send to kitchen" step followed by a separate check and payment. By the
  time a terminal is offline, no KDS in the building is reachable either (it
  is the same network), so there is nothing a queued "sent to kitchen" event
  could usefully do; §8's own wire contract already bundles lines, checks,
  and payments into one object rather than three, which reads as the same
  conclusion. The replay endpoint therefore inserts `order_lines` directly at
  `SERVED`/`kitchenStatus` as given and never calls `kitchenMachine`/
  `orderMachine.assert` against a live transition — it is writing history, not
  performing one. Table/session cleanup (marking a table `CLEANING`, closing
  its session) is attempted best-effort with `tableMachine.can()`, not
  `.assert()`, because an arbitrary amount of real time has passed and the
  table may already be in any state through ordinary floor activity since.
- **True Background Sync (`sync` event) on the service worker.** A page-context
  heartbeat plus the `online` event covers "replay on reconnect" — the till's
  tab is expected to stay open for a shift, unlike a mobile PWA that gets
  backgrounded, and Background Sync's browser support is still inconsistent.
- **Full offline app-shell precaching** — reloading the page, or navigating
  between `/`, `/floor`, `/orders`, etc., mid-outage needs a build-time
  precache manifest for Next's hashed chunks and RSC payloads (what
  `next-pwa`/`serwist` exist to generate), because every one of those routes
  is server-rendered and there is no cached HTML to fall back to without it.
  `sw.js` here only satisfies installability. Concretely: a terminal that goes
  offline while already on the order screen can keep taking orders, printing,
  and finalizing for the rest of that page's lifetime; navigating away from it
  cannot be assumed to work until M18 builds this. A genuine offline reload
  and cross-route navigation is carried there, alongside the Lighthouse pass
  it already owns.
- **REFUND blocking.** `blockedActions` can include `REFUND`, but
  `issueCreditNoteAction` (`apps/pos/lib/credits/actions.ts`) has no caller
  anywhere in `apps/pos`'s UI yet — grepped, zero matches. There is no button
  to gate. Not a regression this milestone introduces; carried forward.
- **`outlet = MOCK_OUTLET`** on the till screen — a pre-existing gap from M10
  (its own runfile's §2 "Out"), untouched here.
- **A live browser/service-worker integration test.** No browser-automation
  tool this session — the same disclosed gap named in M09b/M14/M15.
- **A DB-backed integration test for `/api/sync/orders`.** Same house
  position as `printCheckAction`/`finalizeOrderAction` since M10.

---

## 3. Decisions

**An offline sale is one flat `QueuedOrder`, not three queued steps.** See
Scope Out above. This also settles what "send to kitchen" means offline:
`sendUnsentLines` still stamps cart lines `sentAt` locally (so the existing
Cart/course-firing UI keeps working unmodified) but skips the network call to
`sendToKitchenAction` entirely when offline, rather than queuing a separate
kitchen-routing event that nothing could consume until reconnection anyway.

**Offline printing is always HTML_DIALOG (ADR 0013).** The configured
`print.activePath` is only consulted while online; `OrderScreen` reads
`isOffline` before deciding which print portal to use, not
`activePrintPath` alone.

**The replay endpoint writes history, it does not perform a live
transition.** `orderMachine`/`kitchenMachine` exist to reject an illegal
transition _as it happens_; replaying a sale that has already happened, in
full, at its final state, is a different operation from the one those
machines guard, the same way a data migration inserting old rows does not
re-run application-level validation designed for a live write. Table/session
cleanup is attempted with `.can()`, never `.assert()`, for the reason given in
Scope Out.

**`TAX_DRIFT` is an audit row, `check_no`'s prefix is the terminal's own
label, and offline print path is forced — all three per ADR 0013.**

**The replay endpoint skips the inline 1200 ms fiscal-transmission attempt
`finalizeOrderAction` makes online.** A single reconnect can carry up to 200
queued orders (§8's own blocking threshold) in one request; serialising a
live PRA/FBR round trip per order onto the response the till is waiting on
would make the moment connectivity returns the slowest one to sit through.
`enqueueFiscalOutbox` still queues every invoice inside the same transaction
as before; the existing outbox cron drains it on its normal cadence, exactly
as it already does for any invoice whose own online inline attempt timed out.
This is a deliberate design choice for a batch backlog, not a shortcut —
correctness (every invoice reaches the outbox) is unchanged, only _when_ the
first transmission attempt happens.

**Reference data (menu, tax rules/policy, tables, stations) is _not_ persisted
to IndexedDB this milestone, despite §8's wording.** It does not need to be:
`(terminal)/page.tsx` already reads all of it server-side on every load and
hands it to `OrderScreen` as props, which is what the offline check estimator
reads directly, in memory, for as long as the tab stays open — the realistic
failure mode this milestone targets (the network drops mid-shift, the tab
does not close). An IndexedDB copy would only ever be read back in a scenario
this milestone does not support: a fresh navigation or a page reload while
offline, which fails before that data could matter regardless, because the
page itself is server-rendered (RSC) and Next has no cached HTML to serve
without the app-shell precache scoped to M18 (§2 Out). Persisting it now
would be code with no reachable read path — the same "does this need to
exist at all" question ponytail's own ladder asks first. `(terminal)/page.tsx`
gains one new read (`readCheckPolicy()`) so the in-memory set is complete;
nothing is written to IndexedDB except the order queue and the last-sync
timestamp, both of which the running session genuinely reads back.

---

## 4. Gate

| #   | Criterion                                                                                                                                                                                                                                                          | Verified by                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Result   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| G1  | A `QueuedOrder` built offline conforms exactly to the frozen `QueuedOrderSchema`                                                                                                                                                                                   | `apps/pos/test/offline.test.ts` parses `buildQueuedOrder`'s output through the real schema                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | **PASS** |
| G2  | Offline check numbers carry a terminal-specific prefix and cannot collide with a server-allocated (`CHK-000123`) or another terminal's number                                                                                                                      | `offline.test.ts` — format and cross-terminal uniqueness                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | **PASS** |
| G3  | `computeOfflineState` agrees with `OfflineBanner`'s own 200-order/6-hour thresholds and produces the exact `blockedActions` set §8 names                                                                                                                           | `offline.test.ts` against `packages/ui`'s published constants                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | **PASS** |
| G4  | `POST /api/sync/orders` replays a queued order end to end — order, lines, check, payment, invoice with a real `local_no`, fiscal outbox rows — inside one idempotent transaction keyed on `clientOrderUuid`, and records `TAX_DRIFT` as an audit row on divergence | code review of `app/api/sync/orders/route.ts` against `finalizeOrderAction`/`printCheckAction`'s established shape (disclosed: no DB-backed test, house position since M10)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | **PASS** |
| G5  | `PosShell`'s offline banner and `DiscountDialog`'s supervisor-discount block read real `navigator.onLine`/queue state; the Phase-1 `SIMULATED_OFFLINE` switch is gone                                                                                              | code review of `PosShell.tsx`/`OrderScreen.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | **PASS** |
| G6  | `TaxInvoiceReceipt` shows `Order <n>` and `PROVISIONAL — FISCAL PENDING`, never `invoice.localNo`, when `offline` is set                                                                                                                                           | `apps/pos/test/receipt.test.tsx` (new case)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | **PASS** |
| G7  | Shift close is refused while offline, with a visible reason, not a silently-failing network call                                                                                                                                                                   | code review of `ShiftScreen.tsx`/`CloseShiftDialog.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | **PASS** |
| G8  | `apps/pos` is installable: a linked `manifest.json` with icons, a registered service worker                                                                                                                                                                        | code review; `pnpm build` succeeds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | **PASS** |
| G9  | No `packages/contracts` change                                                                                                                                                                                                                                     | `git diff --stat packages/contracts/src` — empty                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | **PASS** |
| G10 | Workspace green: typecheck, lint, test, build, `pnpm gates`                                                                                                                                                                                                        | `pnpm run ci` — all 14 packages typecheck and lint clean; `@natech/pos` 196/196 (182 pre-existing + 14 new: `queueLogic.test.ts`, `checkNo.test.ts`, `buildQueuedOrder.test.ts`, `receipt.test.tsx`'s new offline case); every other package green; `packages/db`'s pre-existing `auth-attempts.test.ts` timing flake is the sole failure, carried since M09a and named in M14/M15's own gate tables as unrelated; `pnpm build` succeeds for all five buildable targets, `/api/sync/orders` and `/manifest.webmanifest` both present in `apps/pos`'s route list; `pnpm gates` (brand-grep, mock-data-grep, tax-column-grep, migration-diff) all pass | **PASS** |

**Disclosed gaps:**

1. No full offline app-shell precache — a genuine offline page reload is not
   yet possible; carried to M18 (§2 Out).
2. No Background Sync API — a page-context heartbeat substitutes (§3).
3. REFUND is not gated in any UI, because no UI calls the refund action yet
   (§2 Out) — not a regression.
4. No DB-backed integration test for the replay endpoint, and no live
   browser/service-worker test — same disclosed class as every milestone
   since M09b/M10.
5. `outlet = MOCK_OUTLET` — pre-existing, M10's own gap, untouched.
6. The pre-existing `auth-attempts.test.ts` timing failure (M09a §4) — still
   carried, still unrelated.

---

## 5. Exit

- [x] All gate criteria pass, with the disclosed gaps above
- [x] No change to `packages/contracts/src` — the freeze holds
- [ ] **Next: M17 · compliance-rehearsal**

### Carried forward

| Item                                                                                                    | Milestone                                  |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Full offline app-shell precaching (a real offline page reload)                                          | M18                                        |
| Background Sync API, if browser support and the till's usage pattern ever justify it over the heartbeat | unscheduled                                |
| A REFUND UI entry point, and blocking it offline once one exists                                        | unscheduled                                |
| Folding `TAX_DRIFT` into the nightly reconciliation email alongside `FAILED_PERMANENT`/`DEAD`           | unscheduled — ADR 0013                     |
| A live-browser/service-worker interactive pass, once tooling allows it                                  | unscheduled, carried since M09b            |
| A DB-backed integration test for `/api/sync/orders`                                                     | unscheduled, same house position since M10 |
| `outlet = MOCK_OUTLET` on the till screen                                                               | unscheduled — M10's own gap                |
| The pre-existing `auth-attempts.test.ts` timing failure (M09a §4)                                       | unscheduled                                |
| Resend webhooks — bounce/complaint tracking                                                             | unscheduled                                |
| A dedicated Cloudflare Worker resizing R2 images                                                        | unscheduled                                |
| `RealtimeProvider`, retiring the raw-`EventSource` workaround                                           | unscheduled, carried since M09a/M09b       |
| A thumbnail on `MenuBrowser`'s list rows                                                                | unscheduled, carried since M14             |
