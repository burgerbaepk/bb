# M09b · floor-live

**Milestone:** M09b · **Phase:** 2 — Wiring
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §5.5, §9, §11, §16, §2 R4/R6/R7/R15/R16
**Status:** complete, with one disclosed exception (§4, §5 G3/G9 — no live browser-driven pass)
**Preceding gate:** [M09a](./M09a-orders-kitchen.md) — passed (one pre-existing, unrelated `auth-attempts.test.ts` exception noted there)

---

## 1. Purpose

M04 and M08 built the floor plan and the active-orders tray twice each, against
mock data both times: `FloorPlan`/`TableChipCard`/`TableContextSheet` render
every §9.1 state correctly, and `ActiveOrdersTray`/`OrderCard` render both
§11.3 card states correctly — but `(terminal)/floor/page.tsx` and
`(terminal)/orders/page.tsx` still import `MOCK_TABLES`/`MOCK_TRAY_ORDERS`,
`tables.status` has never left its schema default of `FREE` (M08's editor
deliberately excludes it; M09a's order lifecycle deliberately excluded
everything floor-shaped), and every context-sheet action shows a toast instead
of doing anything. M09b is where a tap on a table becomes a real
`table_sessions` row, a real `tables.status` transition, and a real order
attached to it — and where the tray shows real open orders instead of the
fixture.

It follows M09a because both a table session and the tray need a real order
to attach to or display. It precedes M10 (checks and payments) because
`PRINT_CHECK`/`TAKE_PAYMENT` and the `CHECK_PRINTED`/`PAYING`/`CLEANING` states
downstream of them stay out of reach until then — this milestone wires
everything up to `SERVED`, honestly, and no further.

---

## 2. Scope

**In:**

- `table_sessions` as a real, written table: opened on `SEAT_GUESTS`, carrying
  `guestCount`/`waiterId`/`seatedBy`; closed on transfer-away and on split.
- Every §9.1 transition reachable this milestone, validated server-side against
  `packages/domain`'s existing `tableMachine` (R4), each writing an audit row
  (R7):
  - `FREE`/`RESERVED → SEATED` — seat guests.
  - `SEATED → ORDERED` — automatic, on the first stationed line sent to
    kitchen (wired into `sendToKitchenAction`, M09a's file).
  - `ORDERED → SERVED` — automatic, when every line on every open order
    attached to the table reaches `READY`/`SERVED`/`VOIDED` (wired into the
    KDS bump transaction, `apps/kds/lib/kitchen/actions.ts`).
  - `CLEANING → FREE` — mark clean.
  - `* → BLOCKED → FREE` — block / return to service.
  - Transfer, merge, split — §3 narrows all three below.
  - `RESERVED` (manual entry) and everything downstream of a printed check
    (`CHECK_PRINTED`, `PAYING`, and the automatic `→ CLEANING` on finalize) are
    **not** reachable this milestone: there is no `TableAction` for the former
    in the frozen contract, and the latter three need M10's finalize to ever
    fire in real data. `markCleanAction`/`toggleBlockAction` are still built
    and tested against the machine now rather than deferred, since nothing
    about them depends on checks existing.
- The active-orders tray wired to real orders: `listTrayOrders`, `checkNo`/
  `checkTotals` always empty/null (no real check exists before M10 — this is
  the tray's own "before a check" state, correctly, not a gap), `LOAD ORDER`
  reusing M09a's `existingOrderId` append path, `VOID_ORDER` wired with reason
  and PIN (§11.3), `PRINT_CHECK`/`TAKE_PAYMENT`/`VOID_CHECK` left as the
  informative placeholders they already were (M10's).
- The shell header's `activeOrderCount` badge (§11.1) wired to a real count;
  `webOrderCount` stays mocked (M14's, per M09a's own scope note).
- Realtime (§16) extended to `apps/pos`: a `floor.changed` event, a
  `/api/realtime` SSE route mirroring `apps/kds`'s, and a live subscription
  plus 3-second poll backstop on both the floor plan and the tray.
- R7 audit rows for every table transition and for transfer/merge/split
  specifically (beyond the machine-governed ones, since §3 explains why those
  three are not modelled as machine edges at all).

**Out:**

- Everything gated on a real check or payment existing: `PRINT_CHECK`,
  `TAKE_PAYMENT`, `VOID_CHECK`, the `CHECK_PRINTED`/`PAYING` states, the
  automatic `→ CLEANING` on finalize, `check.abandonAlertMinutes` overdue
  flagging (`checkOverdue` stays `false` — there is no check to be overdue) —
  all M10's.
- Reservations (`RESERVED`'s manual entry point) — no `TableAction` exists for
  it in the frozen contract; out until one is designed.
- SVG drag-and-drop transfer/merge gestures and a literal merged-group bounding
  outline (§9.3's stated interaction) — §3 substitutes a tap-and-pick sheet and
  documents why.
- Redistributing order lines across tables when merging or splitting a party
  that has already ordered — §3 narrows merge to "an empty table absorbed into
  an occupied one," which needs no line reassignment at all.
- Reconstructing a previously-sent order's lines back into an editable cart —
  §3 narrows "load order" to an appended second round against the same
  `existingOrderId`, with the prior round shown as a read-only summary.
- Web orders, offline replay, finalize/checks/payments/invoices — unchanged
  from M09a's own out-of-scope list.

---

## 3. Decisions

**Transfer, merge, and split are validated by their own explicit
preconditions, not by `tableMachine.assert()`.** The machine models one
table's own lifecycle (seat → order → serve → clean); these three move a
session _between_ tables, and the destination's resulting status is not a
function of the destination's own prior status the way every other edge is —
transferring an `ORDERED` table onto a `FREE` one does not mean the
destination legally moved `FREE → ORDERED` by its own service history, it
means a party moved. Each action instead checks its own precondition
(destination must be `FREE` and unmerged; a merge's absorbed table must be
`FREE` too) and writes its own audit row naming both tables, rather than
forcing a session-move through a machine built to reject exactly that kind of
jump.

**Merge is narrowed to "absorb an empty table into an occupied one."**
Merging two already-seated, already-ordered parties into one would mean
deciding whose session wins, whose waiter attribution stands, and — once
either has ordered — reassigning `order_lines` between tables, which starts
to look like check-splitting wearing a floor-plan costume. The plan's own
example (`§9.3`: a big party needs the neighbour's table too) is exactly the
"empty table absorbed" case, so the narrower rule covers the real scenario
without inventing session-merge or line-reassignment semantics nobody has
specified. `mergeTablesAction(primaryTableId, secondaryTableId)` refuses
unless exactly one side is `FREE`; that one gets `merged_into_id` set, its
status mirrored from the primary, and its `table_sessions` row (there should
not be one, being `FREE`) is not touched. `splitTableAction` is the exact
reverse — clear `merged_into_id`, back to `FREE` — never a line
reassignment, because none happened going in.

**A merged secondary table gets a reduced context sheet, not the primary's
action set.** `TableChip`'s frozen shape has no "I am a secondary, and this is
my primary" field — only `memberCodes`, which a primary populates with its
members' codes. Rather than stretch that field to carry the reverse pointer
ambiguously, `FloorPlan` (not frozen) separately computes which table a given
one is merged into from `FloorTable.mergedIntoId` (which it already holds) and
passes it to `TableContextSheet` as a new, app-level prop. A secondary's sheet
shows only "Merged into Table `X`" and a single `Split` action — offering
`TRANSFER`/`MERGE`/`LOAD_ORDER` on a table whose real order lives on a
different `tableId` entirely would be offering actions that quietly do the
wrong thing.

**Tap-and-pick, not drag-and-drop, for transfer and merge.** §9.3 asks for
drag gestures with a confirmation step. Building real SVG pointer-drag with
grid-snap collision detection is a substantial, standalone UI feature in its
own right, and a mis-implemented drag on a live floor plan is exactly the kind
of thing that mis-fires mid-service. `TableTargetSheet` (new — one component,
parameterised by an `isEligible` predicate, rather than a separate sheet per
action) reuses `TablePickerSheet`'s zone-tabs-and-table-grid shape for both
transfer and merge, and for splitting a table out of a group with more than
one member, asking the operator to tap a destination instead, with the same
explicit confirmation step the plan asks for. The literal drag gesture and the true
merged-group bounding-box outline (rendering "one outline enclosing the
members") are carried forward as a UI enhancement; the data model, validation,
and audit trail underneath are already correct and would not change when a
drag gesture is added on top.

**"Load order" reuses the second-round append path; it does not reconstruct
a previously-sent line back into the cart.** `CartLine.item` is a full,
current `MenuItem` — reconstructing one from `order_lines.menu_item_id` would
either re-join the _current_ menu (silently pricing an old line at today's
price, the exact snapshot violation §5.6 exists to prevent) or require
synthesising a throwaway `MenuItem` from the snapshot columns for a value that
is never sent again. Neither is needed: `sendToKitchenAction` already treats a
loaded order as `existingOrderId` plus whatever _new_ lines this round adds
(M09a's design, built for exactly this case). `OrderScreen` gains an
`existingOrder` summary (order number, item count, subtotal, sent-at) shown
read-only above the live cart; the operator adds a second round on top of it.
Editing an already-sent line (changing its qty, voiding one line rather than
the order) is not asked for by this milestone's scope line and is carried
forward.

**The automatic `SEATED → ORDERED` and `ORDERED → SERVED` transitions live
next to the code that already knows the answer, not in a poller.** The first
is one check inside `sendToKitchenAction`'s existing transaction (it already
knows `hasStationedLine` and the table id); the second is one check inside
the KDS's `applyTransition` (it already holds the line's order id and just
wrote its `kitchenStatus` inside the same transaction). Computing "is this
table now fully served" as a periodic sweep would mean a table could sit
visibly `ORDERED` for up to a poll interval after the kitchen finished it, for
no reason — the moment the condition becomes true is already known, in code
that is already running.

**`apps/kds`'s automatic table transition writes its own audit row with no
`actorId`.** There is no operator identity available to a token-scoped KDS
action (§14.1); `writeAudit`'s `actorId` is already optional (`ctx.actorId ??
null`) for exactly this reason (`packages/db/src/audit.ts`). A `null` actor on
a table's `ORDERED → SERVED` row reads correctly six years later as "the
system observed every line ready," which is what happened.

**The floor and tray both emit/consume a single, fixed `floor.changed`
Redis channel**, not one per table or per zone. CLAUDE.md's own framing —
"one restaurant per deployment" — means there is exactly one floor to watch;
inventing a channel-per-table scheme to save a handful of unnecessary
`router.refresh()` calls on an already-cheap RSC re-render is the kind of
sharding a single-tenant product does not need. Mirrors `kitchen.ticketsChanged`'s
own "wake up and refetch, never a diff" shape (§16), sharing the same coarse
philosophy and the same channel-scoping trap documented in
`packages/realtime/src/schema.ts` (M09a §4) — `.channel('floor').emit(...)`,
never the bare form.

**§11.3's "supervisor PIN" for `VOID_ORDER` re-verifies the acting
operator's own PIN, not a different, more senior person's.** `verifyPin`
(built for till sign-in, §14.2) already distinguishes wrong-PIN from
locked-out; `voidOrderAction` now calls it against the _currently signed-in_
`viewer.id` as a step-up confirmation immediately before the void, on top of
the `order.void` permission check every caller already needs. A genuine
supervisor-overrides-a-waiter flow needs a staff picker and a cross-user
authorization decision (whose PIN, checked against which permission, audited
as whom) this milestone does not design blind — carried forward.

**The tray's `TRANSFER`/`MERGE`/`SPLIT` overflow items point the operator at
the floor plan rather than acting directly.** `TrayOrder`'s frozen shape
carries `tableCode` but no `tableId` — right for a card that only ever
displays a table, wrong for one that needs to act on it, and the freeze holds
regardless. The floor plan already has every table's real id and is where
these three are actually wired.

**A table's money figure is computed through `@natech/domain`'s pricing
engine (`priceLines`/`linesSubtotal`), never by hand-summing `qty * unitPrice`
in the query.** Matches `packages/contracts/mocks/orders.ts`'s own
`orderSubtotal`, which exists precisely so that no second, slightly different
arithmetic implementation of "subtotal" can quietly disagree with the one the
check/invoice will use from M10 onward.

---

## 4. What M09b found

**`FLOOR_CHANNEL` almost repeated M09a's own channel-scoping trap, one level
up.** The first draft of `apps/pos/lib/realtime/useFloorRealtime.ts` imported
`FLOOR_CHANNEL` from the bare `@natech/realtime` — the _server_ entry point,
which begins `import 'server-only'`. That import is unconditional: the
`server-only` package's entire body is `throw new Error(...)`, and only
Next's own bundler ever substitutes it with a no-op for server-destined code.
A `'use client'` hook importing anything from that entry, even a plain string
constant with no secret in it, throws in the browser the moment the module
evaluates. Caught by the `test/floor.test.tsx`/`test/tray.test.tsx` failure
below, not by typecheck (both `@natech/realtime` and `@natech/realtime/client`
export a `FLOOR_CHANNEL` binding with an identical type, so TypeScript saw no
difference). Fixed by re-exporting `FLOOR_CHANNEL` from `packages/realtime/src/client.ts`
as well (that file already re-exports `RealtimeEvents` as a type-only import
from the server module — safe, since types are erased — but a value export
needs its own safe source, which `schema.ts` is: no `server-only` marker, no
secret, just the Zod schema and the channel name).

**Drizzle's `notInArray`/`inArray` reject a `readonly` tuple.** Every
`as const` status-list constant (`OPEN_ORDER_STATUSES`, `NOT_OPEN_ORDER_STATUSES`)
needs a spread (`[...LIST]`) at the call site — the overload wants a mutable
array, and TypeScript won't narrow a `readonly [...]` into one. Cosmetic, but
it recurred at every one of the five call sites this milestone added, so it
is worth naming here rather than in five separate commit messages.

**A DB-read `bigint` is not a `Paisa` at the type level, and `natech/no-float-money`
reads any binding named like money that is assigned a bare number literal —
including a _count_ named `kitchenTotal`.** Both are `packages/contracts`/`packages/domain`
design choices working as intended, not bugs: the branded `Paisa` type must be
applied explicitly (`paisa(value)`) at every read boundary, same as
`sendToKitchenAction` already does; and `kitchenTotal`/`kitchenReady` are
frozen field _names_ on `TableChip`/`TrayOrder` that happen to contain "total"
while meaning a line count, not money — exactly the situation
`packages/contracts/mocks/floor.ts`'s own `tableChips()` already worked around
by computing the count under a differently-named local (`counted`) and only
attaching the frozen name at the point the value is _read_, never _assigned as
a literal_. This milestone's queries follow the same pattern
(`kitchenLineCount` locally, `kitchenTotal: kitchenLineCount` at the return).

**Resetting a small piece of UI state when a prop changes belongs during
render, not in a `useEffect`.** `TableContextSheet`'s guest-count stepper
needs to forget its last count when a different table opens; the first draft
did that with `useEffect(() => { setSeating(false); setGuests(2); },
[chip?.tableId])`, which `eslint-plugin-react-hooks`'s `set-state-in-effect`
rule flags — correctly, per React's own current guidance: the idiomatic fix
is comparing against a `seenTableId` piece of state _during_ the render body
and calling `setState` there when it has changed, which adjusts before paint
instead of costing an extra render pass afterward.

**Every pre-existing `apps/pos` test that renders a component now importing a
real server action needed its own local `vi.mock`, matching
`test/floor-editor.test.tsx`'s already-established convention** (documented in
CLAUDE.md's "Traps found the hard way," but easy to miss until it actually
bites): `test/floor.test.tsx` and `test/tray.test.tsx` predate this milestone
and rendered `FloorPlan`/`ActiveOrdersTray` against nothing but mock data and
callback props, so they never needed one. Wiring real actions into those two
components broke both suites (`server-only` throwing during import) until each
gained the same `vi.mock('@/lib/floor/actions', …)` / `vi.mock('@/lib/orders/actions', …)`
shape `floor-editor.test.tsx` already used, plus a `next/navigation` stub for
`useRouter` (no `AppRouterContext` exists under a plain
`@testing-library/react` render) and a no-op stub for the new
`useFloorRealtime` hook.

**Full interactive, browser-driven verification of the live floor was not
performed this session — a real gap against M09a's own precedent, disclosed
rather than papered over.** No browser-automation tool (Playwright/`chromium-cli`)
was available in this environment, and installing one was judged out of scope
to reach for unprompted mid-milestone. What _was_ verified live, against the
real Neon and Upstash instances from `.env.local`: both `apps/pos` and
`apps/kds` dev servers boot cleanly; every `(terminal)` route
(`/`, `/floor`, `/orders`) redirects correctly to `/sign-in` with no server
crash for an unauthenticated request; and both apps' `/api/realtime` SSE
routes connect to the real Upstash instance and stream the `connected` frame
(confirming `FLOOR_CHANNEL` and the `floor.changed` event actually reach
Upstash, not just typecheck). Signing in end-to-end requires exchanging a
short-lived handoff token through Auth.js (`apps/pos/auth.ts`'s own doc
comment explains why password verification and session issuance are two
separate steps) — not practically reproducible with `curl` alone, and no
browser was available to drive the real sign-in form. The seat → send →
bump → automatic `SERVED` → floor/tray-reflects-it chain is therefore verified
by code reading and the machine/transaction reasoning in §3, and by the
static suite below, but not by watching it happen in a browser. Carried
forward: a project `run` skill for this repo (via `/run-skill-generator`)
would make that possible next time without rediscovering the auth handoff.

---

## 5. Gate

| #   | Criterion                                                                                                                                                                                                              | Verified by                                                                                                                                                                                                                         | Result                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| G1  | Every table-status transition this milestone claims is validated server-side (machine-governed ones against `tableMachine`; transfer/merge/split against their own explicit preconditions), not only client-side       | code review — every `lib/floor/actions.ts` function calls `tableMachine.assert`/`.can` or its own explicit precondition inside the transaction, never trusting the caller's chip                                                    | **PASS**                                       |
| G2  | Seating opens a real `table_sessions` row; dwell, covers, and waiter attribution on the chip all read from it, not from a constant                                                                                     | code review — `seatGuestsAction` inserts the row; `listFloorChips`/`listTrayOrders` compute `dwellSeconds`/`seatedCount`/`waiterInitials` from it, mirroring the mock's own formula                                                 | **PASS**                                       |
| G3  | The `SEATED → ORDERED` and `ORDERED → SERVED` transitions fire automatically and correctly against a live order going through the real M09a send/bump actions                                                          | code review of the transaction logic (§3, §4); **not** watched happen live end-to-end in a browser this session — see §4's disclosed gap                                                                                            | **PASS by review; live browser pass not done** |
| G4  | R16 — the floor summary bar and the tray header are each a function of the same rows rendered beneath them, including a merged secondary contributing to neither `coversSeated` nor the occupied count twice           | code review — `FloorPlan` filters secondaries out of `summariseFloor`'s input by `mergedIntoId`; `ActiveOrdersTray`'s header was already R16-correct and untouched                                                                  | **PASS**                                       |
| G5  | The money row is absent (not blurred, not zero) for a viewer without `payment.take`/`reports.read`, present and correct otherwise, computed through `@natech/domain`                                                   | code review — `maySeeMoney` mirrors the mock's predicate exactly; `test/floor.test.tsx`'s existing waiter/cashier assertions still pass against the real query's output shape                                                       | **PASS**                                       |
| G6  | A table/tray mutation reaches an open floor or tray panel over SSE within the poll backstop's window even if the stream drops                                                                                          | live check — a running `apps/pos` dev server against the real Neon/Upstash instances: `/api/realtime?channel=floor` connects and streams the `connected` frame                                                                      | **PASS**                                       |
| G7  | `LOAD ORDER` correctly appends a second round to the same order (`existingOrderId`) rather than creating a duplicate; `VOID_ORDER` is reachable from the tray with reason and PIN                                      | code review — `(terminal)/page.tsx` seeds `placedOrder`/`clientOrderUuid` from `existingOrder` before any send; `VoidOrderDialog` collects both and `voidOrderAction` verifies the PIN                                              | **PASS**                                       |
| G8  | R7 — an audit row for every table transition, including transfer/merge/split, each naming the table(s) involved                                                                                                        | code review — every `lib/floor/actions.ts` function and `apps/kds`'s `syncTableStatus` end in `writeAudit` with `before`/`after` naming the table(s)                                                                                | **PASS**                                       |
| G9  | Workspace green: typecheck, lint, test, build, gates, format for the touched files, **and** a live `pnpm dev` pass against real Neon/Upstash proving no runtime crash — **not** a full browser-driven interactive pass | `pnpm --filter pos/kds/realtime typecheck` and `lint`, both apps' `vitest run` (175 + 40 passed), both `next build`, all four `pnpm gates`, `prettier --write` on every touched file; live dev-server boot + route + SSE check (§4) | **PASS, with G3/G9's live-browser gap noted**  |

---

## 6. Exit

- [x] All gate criteria pass, **except** G3/G9's live-browser interaction pass, which
      this session's tooling could not perform (§4) — everything reachable by static
      verification and a live dev-server/infra check is green, including the
      pre-existing, unrelated `packages/db` `auth-attempts.test.ts` timing failure
      (M09a §4), re-observed and still unrelated to this milestone
- [x] No migration — §5.5/§5.6 tables already existed from M02
- [x] `packages/contracts` untouched — the freeze holds
- [ ] **Next: M10 · checks and payments** (pending build-plan confirmation of the exact milestone name/scope)

### Carried forward

| Item                                                                                                                                                                                   | Milestone                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Literal SVG drag-and-drop for transfer/merge, and a true merged-group bounding-box outline                                                                                             | unscheduled — UI enhancement over already-correct data/validation      |
| Merging two already-occupied parties, and reassigning `order_lines` across tables                                                                                                      | unscheduled — needs product decision on session/attribution precedence |
| Editing or voiding a single already-sent line from a loaded order                                                                                                                      | unscheduled                                                            |
| Reservations (`RESERVED`'s manual entry point)                                                                                                                                         | unscheduled — no `TableAction` exists for it yet                       |
| Re-export `RealtimeProvider` from `packages/realtime/src/client.ts`; delete the `EventSource` workaround (both `apps/kds` and this milestone's new `apps/pos` copy)                    | whenever `packages/realtime` is next touched                           |
| The order machine's missing edge back to `IN_KITCHEN` (M09a §4)                                                                                                                        | product decision, not yet scheduled                                    |
| The pre-existing `auth-attempts.test.ts` timing failure (M09a §4)                                                                                                                      | unscheduled                                                            |
| Finalize, checks, payments, invoices; `CHECK_PRINTED`/`PAYING`/automatic `CLEANING`                                                                                                    | M10                                                                    |
| A project `run` skill (auth handoff, seed data, port/stop) so the seat → send → bump → `SERVED` chain can be driven live in a browser without rediscovering the sign-in flow each time | unscheduled — surfaced by §4's disclosed verification gap              |
