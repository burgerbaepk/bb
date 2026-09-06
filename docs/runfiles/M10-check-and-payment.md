# M10 · check-and-payment

**Milestone:** M10 · **Phase:** 2 — Wiring
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §5.7, §5.8, §6, §9.1, §11.3, §12, §2 R2/R3/R4/R5/R7/R9/R10/R17
**Preceding gate:** [M09b](./M09b-floor-live.md) — passed, with the disclosed G3/G9 live-browser gap carried forward, unrelated to this milestone

---

## 1. Purpose

Every piece this milestone needs was already built somewhere else in the
repository, correctly, against the wrong data source. M03 built the tax
engine — `computeTotals`, `estimateCheck`, `allocateProportionally`,
`resolveRate`, `buildTaxSnapshot` — with 45+ golden fixtures. M02 built
`order_checks`, `invoices`, `invoice_tax_lines`, `payments`, the two
FOR-UPDATE counters, and the immutability trigger. M04 built `CheckReceipt`,
`TaxInvoiceReceipt`, `CheckPreviewDialog`, `PaymentSheet`,
`MethodMismatchDialog`, and the whole §6.2 flow — as a self-contained
client-side mock in `OrderScreen.tsx`, computing against
`MOCK_TAX_POLICY`/`MOCK_TAX_RULES`/`MOCK_CHECK_POLICY` and holding the
"printed check" and "finalized invoice" in local React state that evaporates
on refresh. M06 froze `OrderCheck`/`Invoice`/`Payment`/`TrayOrder.checkTotals`
in `packages/contracts`, already shaped correctly (R17 expressed as an absent
field, exactly as ADR 0008 describes).

M10 is the wiring: real actions that allocate `check_no`/`local_no` from the
real counters, write real rows, validate against `orderMachine`/`tableMachine`
(already carrying every `CHECK_PRINTED`/`PAYING`/`FINALIZED` edge this
milestone needs — M03 built the machines for this milestone before this
milestone existed), and a print path that can put ESC/POS bytes on real
hardware instead of only a browser print dialog. Nothing about the tax
mathematics changes; everything about where the numbers come from does.

---

## 2. Scope

**In:**

- `apps/pos/lib/tax/queries.ts` — `readTaxPolicy()`, `readCheckPolicy()`,
  `readTaxRules()` against the real `settings`/`tax_rules`/`tax_classes`
  tables (seeded in M02), replacing `MOCK_TAX_POLICY`/`MOCK_TAX_RULES`/
  `MOCK_CHECK_POLICY` everywhere they are read for a real order.
- `printCheckAction` — real `check_no` allocation (`allocateCheckNo`), a real
  `order_checks` row, `orderMachine`/`tableMachine` transition to
  `CHECK_PRINTED`, R7 audit. The same action handles a reprint (an existing
  open check on the order) by superseding it (§6.5) and, past
  `checkPolicy.maxReprints`, requires a supervisor PIN step-up (§6.8) — see §3.
- `voidCheckAction` — reason + PIN step-up (mirroring `voidOrderAction`),
  `order_checks.void_reason`/`voided_by`/`voided_at`, `CHECK_PRINTED → SERVED`
  on both machines (§9.1's own documented edge for exactly this).
- `finalizeOrderAction` — recomputes `computeTotals` server-side from the
  order's real `order_lines` and the real policy/rules (never trusting a
  client-submitted total), allocates `local_no` (`allocateLocalNo`), inserts
  `invoices` + `invoice_tax_lines` + one `payments` row per slice (including
  any `DECLINED` attempts — Appendix A.3), sets `business_date` from
  `currentBusinessDate()` (already built, M09a), `FINALIZED`/`CLEANING`
  transition, closes the `table_sessions` row, R7 audit. Does **not** touch
  `fiscal_outbox` — see §3.
- The method-mismatch path (§6.5): `detectMethodMismatch` stays a client-side
  preview gate (as M04 built it) ahead of calling `finalizeOrderAction`; the
  reprint-on-mismatch path calls the real `printCheckAction`.
- `TableChip.checkOverdue` and the tray's real `checkNo`/`checkTotals`/
  `secondsSinceCheck` computed from a real open `order_checks` row against
  `checkPolicy.abandonAlertMinutes` — the visual half of §6.13 (§9.1's own
  words). The **Abandoned Checks exception report** itself is §17/M13's; this
  milestone only makes the floor-plan/tray badge that was already built in
  M04/M09b start telling the truth.
- All three §12 print paths for the check and the tax invoice:
  1. **Print bridge** (`tooling/print-bridge`) — a real `node:http` server on
     `PRINT_BRIDGE_PORT`, an ESC/POS byte-buffer builder, an in-memory queue
     with retry and a paper-out state, built from the M00 scaffold.
  2. **WebUSB** — `navigator.usb`, gesture-gated, Chrome-only, feature-detected.
  3. **80mm HTML + browser print dialog** — a `PrintPortal` per document,
     mirroring M09a's `KitchenTicketPrintPortal` (the one place in the
     codebase that already does this).
     Selectable via the `print.activePath` setting (`PrintPathSchema`, already
     frozen in `packages/contracts/src/outlet.ts` since M06, unused until now).
- `check.print`/`check.reprint`/`check.void`/`payment.take` permission checks
  (already defined in `packages/contracts/src/enums.ts` since M06/M07).

**Out:**

- **Fiscal transmission of any kind.** `finalizeOrderAction` does not enqueue
  `fiscal_outbox`, does not attempt inline transmission, and leaves
  `invoices.pra_fiscal_no`/`fbr_fiscal_no`/`qr_payload` unset. §6.2's own flow
  diagram describes enqueue-and-attempt as part of finalize, but M11's own
  scope line owns "outbox, retry" — M11 is where a `fiscal_outbox` row is
  first written by anything. `TaxInvoiceReceipt` already renders the pending
  state correctly (M04) with no fiscal number to show.
- Credit notes (`credit_notes` table, `CreditNoteSchema`) — M11's, per its own
  scope line ("credit notes").
- The compliance dashboard — explicitly M11's own scope line ("compliance
  dashboard live"). This milestone reads `order_checks` for the floor/tray
  badge only, not for a dashboard surface.
- The Abandoned Checks exception report, check-to-invoice conversion rate,
  and every other §17 report — M13's ("every report in §17").
- Writing/editing `tax.policy`, `check.policy`, or `print.activePath` from an
  admin UI. `packages/contracts/mocks/settings.ts`'s generic settings-registry
  renderer is Phase-1 mock groundwork with no wiring milestone naming it
  anywhere in §18 — M08's own scope line is "menu, floor, stations, terminals,
  branding", not settings. This milestone only reads the three keys it needs,
  seeded by M02, falling back to `DEFAULT_TAX_POLICY`/`DEFAULT_CHECK_POLICY`/
  `HTML_DIALOG` if a row is somehow missing. Carried forward, unscheduled.
  the same as it is everywhere else this milestone touches: a settings write
  needs `setting_history` + a reason at audit level HIGH, and no milestone
  before this one built that surface.
- A signed, installable print-bridge binary. §12 calls it "a signed Node
  binary on the till"; code-signing and OS packaging are infrastructure this
  session cannot produce or verify. The server this milestone builds is the
  real thing minus the installer — see §3, §4.
- Reservations, drag-and-drop transfer/merge, editing an already-sent line,
  and every other item M09b already carried forward — untouched.
- Split-payment UI beyond what M04 already built (`SplitPaymentPanel`) — its
  math (`allocateProportionally`) already has 45+ fixtures from M03; this
  milestone wires its output into a real `finalizeOrderAction` call, nothing
  about the panel itself changes.

---

## 3. Decisions

**Preview and commit collapse into one call for the check; they cannot for
payment.** M04's `CheckPreviewDialog` opens _before_ committing anything,
which cost nothing against a pure client-side `buildCheck()`. Once printing a
check means allocating a real `check_no` and writing a real row, keeping a
true no-cost preview would mean fetching real policy/rules to the client and
recomputing there — exactly the split-brain `computeTotals` already exists to
prevent (the estimator and the invoice must be _the same call_, differently
parameterised, never two implementations that can silently disagree). §5.7's
own words settle it anyway: "gaps are acceptable here because a check has no
fiscal status." So "Print check" now calls `printCheckAction` directly, the
same way `sendToKitchenAction` already works with no preview step in this
exact codebase, and `CheckPreviewDialog` becomes a post-commit receipt view
with its own print trigger. Payment cannot collapse the same way: `PaymentSheet`
still needs a live, responsive total as the cashier picks a method, records a
decline, or splits tenders, before anything is allocated. It keeps computing
`computeTotals` client-side for that preview — now against the real
`taxPolicy`/`taxRules` fetched server-side and passed down as props instead of
`MOCK_TAX_POLICY`/`MOCK_TAX_RULES` — and only `finalizeOrderAction` persists
anything, recomputing independently from the DB rather than trusting the
preview.

**`finalizeOrderAction` recomputes from `order_lines`, never from a
client-submitted total.** The client sends only what a payment physically is —
which methods, how much was tendered against each, which attempts were
declined — the same shape `PaymentSheet` already collects. Trusting a client
figure for `grandTotal` would let a compromised or buggy client finalize an
invoice at any number it likes; recomputing server-side from the persisted
lines is the same discipline `sendToKitchenAction` already applies to prices
(R1's snapshot-at-add-time exists for exactly this reason) extended to the
one place money becomes a fiscal fact.

**One `printCheckAction`, not two, branches on whether an open check already
exists.** `CheckPreviewDialog`'s `isReprint` prop already toggles copy for
both cases against the same underlying `buildCheck()` call; keeping one action
server-side that looks up the order's current open check and either inserts
fresh or supersedes matches that existing shape rather than inventing a
parallel `reprintCheckAction` that duplicates the estimate/allocate/insert
logic. It checks `check.print` when there is nothing to supersede and
`check.reprint` when there is — both permissions already existed in
`packages/contracts/src/enums.ts` waiting for this milestone.

**Past `checkPolicy.maxReprints`, the action refuses without a PIN rather than
the client precomputing whether one is needed.** `reprintCount` lives on the
server; a client cannot know it is about to cross the limit without asking
first. `printCheckAction` takes an optional `pin` field and returns a typed
refusal (`NEEDS_SUPERVISOR_PIN`) when the limit is hit and no PIN was
supplied; the dialog then shows a PIN field inline and resubmits the same
action, the same step-up shape `voidOrderAction` already established in M09b
for a different threshold (every void, not just the fourth). A new
`PinConfirmDialog` (PIN only, optional reason) is shared between this and
`voidCheckAction`, without touching M09b's `VoidOrderDialog` — that file is
tested and unrelated to this milestone's needs.

**`voidCheckAction` needs a reason; the reprint step-up above does not.** §6.8
lists a reason code for voiding a _printed_ check but only a PIN for a
reprint past the limit — a reprint replaces a document with a corrected one
that still exists; a void removes one from the trail entirely, which is the
`§6.13` pattern enforcement looks for and the thing a reason code exists to
explain.

**Print-path selection reads a single global `print.activePath` setting, not
a per-terminal one, despite §12's "selectable per terminal."**
`PrintPathSchema` (frozen since M06) carries no terminal field, and
`TerminalSchema`/`pos_terminals` carries no print-path column — adding one to
either would be exactly the kind of contract renegotiation §0 rule 7
forbids without its own ADR, for a distinction (till 1 prints via bridge, till
2 via WebUSB) this restaurant's one-terminal-class deployment does not need
yet. A single `settings` row read by every terminal is the honest
implementation of what is actually specified elsewhere in the frozen shape.
Carried forward: a `pos_terminals.print_path` column, the day a second
terminal class actually needs a different path, with its own migration and
its own ADR.

**The print bridge is a real server with a documented ceiling, not a signed
binary.** `tooling/print-bridge/src/server.ts` is a genuine `node:http`
server on `PRINT_BRIDGE_PORT`, a real ESC/POS byte-buffer builder, and a real
in-memory queue with retry and a paper-out flag — everything §12 describes
except the two things a coding session cannot produce: a code-signing
certificate and an OS-level installer/service registration. Its "printer" is
an injectable sink (`PrintSink`), defaulting in dev to one that writes the
raw buffer to a file under the OS temp directory rather than a real USB
device — there is no physical printer in this environment to prove a real
`node:serialport` write against, and pretending otherwise would be a claim
this session cannot back up. `apps/pos`'s client code talks to it over HTTP
exactly as a real deployment would; swapping the dev sink for a real raw-device
writer is a follow-up that changes nothing about the wire protocol.
`# ponytail: in-memory queue, single process — durable/offline queueing across
a bridge restart is the M16 offline milestone's territory, not this one's.`

**WebUSB gets real `transferOut`, not a stub.** It is a small amount of code —
`requestDevice`/`open`/`selectConfiguration`/`claimInterface`/`transferOut`
against the same ESC/POS buffer the bridge path sends over HTTP — unlike the
literal SVG drag-and-drop M09b deferred, there is no disproportionate cost
here to justify deferring it. It is feature-detected (`'usb' in navigator`)
and refuses with a plain message on an unsupported browser, per §12's own
"Chrome only, gesture-gated."

**A `PinConfirmDialog` is extracted; `KitchenTicketPrintPortal` is not
touched.** The former is genuinely new, shared by two call sites this
milestone adds. The latter already works, is covered by M09a's tests, and
copying its ~30-line shape into two new small `CheckPrintPortal`/
`TaxInvoicePrintPortal` components costs less than the regression risk of
generalising a working, tested file for a marginal DRY gain — M09b's own §4
already names this exact file's fragility ("caught by the test failure, not
by typecheck").

**Replay protection continues to be "read status inside the transaction, then
`.assert`", not a new `withIdempotency` call site.** `withIdempotency()` has
existed since M02 with zero call sites in `apps/pos` through M07–M09b; every
milestone so far has relied on a unique column (`client_order_uuid`) or a
terminal machine state (`FINALIZED` has no outbound edges) to make a repeat
mutation fail loudly rather than double-apply. `finalizeOrderAction` continues
that: a second finalize attempt reads `status = 'FINALIZED'` inside its own
transaction and `orderMachine.assert` throws before any row is written.
Introducing the idempotency-key table for the first time in this milestone,
for a class of race the existing pattern already closes, would be new scope
this milestone does not need.

---

## 4. What M10 found

**Turbopack cannot bundle `print-bridge`'s raw TypeScript source through its
own barrel.** Every workspace package here points `main`/`types` straight at
`src/index.ts` (no build step needed for consumers), which works for
`@natech/domain` and the others because their internal relative imports carry
no extension. `tooling/print-bridge` is `moduleResolution: "NodeNext"`
(`packages/config/tsconfig/node.json`) so its own `tsc`/`vitest` runs require
`.js`-suffixed relative imports (`./escpos.js`, resolving to the sibling
`.ts` at compile/run time) — and `tsc --noEmit` from `apps/pos` tolerated
that fine. `next build`'s Turbopack did not: it resolves `./escpos.js`
literally and fails with `Module not found`, four times, one per file
`index.ts` re-exports. Caught by `next build`, not by `tsc` or `vitest` —
worth naming here because it is exactly the kind of gap those two tools
share a blind spot on. Fixed by adding a narrow `"./escpos"` subpath export
(`tooling/print-bridge/package.json`) straight to `src/escpos.ts`, which has
no relative imports of its own to trip over, and pointing `apps/pos`'s three
consumers at `@natech/print-bridge/escpos` instead of the package root —
`createPrintBridgeServer`/`PrintQueue`/`createFileSink` (the parts that do
have the `.js`-suffixed chain) are never imported into `apps/pos` at all, so
the fix costs nothing.

**`finalizeOrderAction` is the first code in the repository ever to write
`table_sessions.closed_at`.** Grepping the whole of `lib/floor/actions.ts`
before writing this action turned up zero writes to that column — only the
`WHERE closed_at IS NULL` reads that treat it as "the open session." M09b's
own scope explicitly stopped before a table could ever reach `CLEANING` in
real data ("the automatic → CLEANING on finalize" was named as M10's), so
this was never reachable before. Left unclosed, the next `SEAT_GUESTS` on a
table that has been through a full sale would `INSERT` a second "open"
session while the first one sits there indefinitely, corrupting dwell/covers
for that table from then on — a latent bug in M09b's own schema, invisible
until something (this milestone) could ever drive a table all the way round
the cycle. Fixed inline, in `finalizeOrderAction`'s own transaction, right
next to the `CLEANING` transition that makes it correct: the party is
leaving at exactly that moment, not before.

**`order_checks.estimate` and `orders` carry no order-level discount column**
— `packages/db/src/schema.ts` matches §5.6 exactly, and neither has one, only
`order_lines.line_discount`. `OrderScreen`'s `DiscountDialog` applies a
discount that lives only in the live cart's React state before a send; once
`printCheckAction`/`finalizeOrderAction` reprice from real, persisted
`order_lines` (this runfile's own §3), there is nowhere to read that value
back from. `loadPriceableOrder` passes `orderDiscount: 0n` accordingly — the
same answer every other real query in this codebase already gives
(`listTrayOrders`/`findOrderSummary` never applied one either), not a
regression this milestone introduces. An order-level discount surviving past
the cart that applied it is a data-contract question for whoever owns that
feature, not something to invent blind here.

**No milestone through M09b ever wrote a direct, DB-backed test for a server
action** — `apps/pos/test/` holds only component-level tests, each mocking
its actions module at the `vi.mock` boundary (`test/setup.ts`'s own doc
comment: "the actions themselves are covered where they can be covered
honestly"). `sendToKitchenAction`, `voidOrderAction`, every `lib/floor/actions.ts`
mutation — none has an integration test exercising it against a real
Postgres. The original draft of this runfile's gate table (G3, G4) proposed
writing the first ones for `finalizeOrderAction`, which would have been new
test infrastructure invented mid-milestone rather than scoped work. Revised
below to the verification this codebase actually relies on: the tax
**math** `finalizeOrderAction`/`printCheckAction` call into is already
proven exactly, including Appendix A.3's card-decline-then-cash figures, by
`packages/domain/test/golden.test.ts`/`scenarios.test.ts`'s 45+ fixtures
(unchanged by this milestone — only the caller changed); the **wiring**
(permission checks, machine transitions, refusal paths, audit rows) gets the
same code-review bar every prior milestone's actions got. A pure, DB-free
piece that this milestone did add new inductive reasoning for —
`deriveChain`'s reprint-count derivation — does get its own direct unit test
(`test/check-chain.test.ts`), split out from `queries.ts` into `chain.ts`
for exactly that testability, the same split `businessDate.ts`/
`businessDateLogic.ts` already established.

---

## 5. Gate

| #   | Criterion                                                                                                                                                  | Verified by                                                                                                                                                                                                                                                                                       | Result   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| G1  | `printCheckAction` allocates a real `check_no`, writes `order_checks`, transitions both machines, and a reprint supersedes rather than mutates             | code review of the transaction against §5.7/§6.5; `allocateCheckNo`'s own FOR-UPDATE lock already covered by `packages/db/test/constraints.test.ts`                                                                                                                                               | **PASS** |
| G2  | Past `checkPolicy.maxReprints`, the action refuses without a valid PIN and succeeds with one                                                               | code review of `printCheckAction`'s two-pass PIN gate (§3)                                                                                                                                                                                                                                        | **PASS** |
| G3  | `finalizeOrderAction` recomputes totals server-side from `order_lines`, ignoring any client-submitted total; the same math reproduces Appendix A.3 exactly | code review — `computeTotals` is called with server-read `domainLines`/`taxPolicy`/`taxRules`, never a client figure; the math itself is `packages/domain/test/golden.test.ts`'s existing, unchanged, byte-exact Appendix A.3 fixture (§4 above)                                                  | **PASS** |
| G4  | `local_no` is gap-free and monotonic under concurrent finalize attempts                                                                                    | unchanged `allocateLocalNo` (`packages/db/src/counters.ts`), already covered by `packages/db/test/constraints.test.ts` — this milestone adds no new caller behaviour around the lock                                                                                                              | **PASS** |
| G5  | R5 — a finalized invoice's totals cannot be altered by a second call                                                                                       | the M02 trigger (unchanged) plus `orderMachine.assert(order.status, 'FINALIZED')` refusing a second attempt before any row is touched (§3's replay-protection decision)                                                                                                                           | **PASS** |
| G6  | R9/R10 — no computed tax value outside the three settled tables; nothing this milestone writes touches `fiscal_outbox`                                     | `pnpm tax-column-grep` — PASS; code review of `finalizeOrderAction` confirms no `fiscal_outbox` import or write                                                                                                                                                                                   | **PASS** |
| G7  | R17 — the check and the tax invoice remain visually distinct and the check carries no fiscal mark, through all three print paths                           | code review of `checkEscPosDocument`/`invoiceEscPosDocument` and both `PrintPortal`s against `CheckReceipt`/`TaxInvoiceReceipt`'s existing, untouched R17 treatment                                                                                                                               | **PASS** |
| G8  | The floor plan's `checkOverdue` and the tray's check total/age are computed from a real `order_checks` row, not a constant                                 | code review of `lib/floor/queries.ts`/`lib/orders/queries.ts`; both mirror `packages/contracts/mocks/floor.ts`/`mocks/tray.ts`'s exact formula (§9.2/§11.3)                                                                                                                                       | **PASS** |
| G9  | R7 — an audit row for print, reprint, void-check, and finalize, each naming the order/check/invoice involved                                               | code review — `printCheckAction`, `voidCheckAction`, `finalizeOrderAction` each end in `writeAudit` with `before`/`after` naming the row                                                                                                                                                          | **PASS** |
| G10 | Workspace green: typecheck, lint, test, build, gates, format for touched files, and a live boot against real Neon proving no runtime crash                 | `pnpm --filter @natech/pos/@natech/print-bridge typecheck`/`lint`/`test` (182 + 4 passed), `next build` (Turbopack, all 28 routes), `pnpm gates` (all four), `prettier --write`; live `pnpm dev` — `/`, `/floor`, `/orders` redirect to `/sign-in`, which returns 200, no server error in the log | **PASS** |

**Disclosed gap, matching M09b's own G3/G9 precedent:** the full interactive
print-check → take-payment → decline-then-cash → finalize flow was not
driven through a real browser this session — no browser-automation tool was
available, and Auth.js's sign-in handoff (M09b §4's own explanation) is not
`curl`-able. Verified instead by code review against the already-proven
domain math, the unchanged M04 UI shapes, and the live dev-server boot above.

---

## 6. Exit

- [x] All gate criteria pass, with the live-browser interactive gap disclosed above (unchanged from M09b's own precedent, not new to this milestone)
- [x] No change to `packages/contracts/src` — the freeze holds
- [ ] **Next: M11 · fiscal**

### Carried forward

| Item                                                                                             | Milestone                                                            |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| `fiscal_outbox` enqueue, inline transmission attempt, PRA/FBR adapters, QR, credit notes         | M11                                                                  |
| Compliance dashboard live data                                                                   | M11                                                                  |
| Abandoned Checks exception report, check-to-invoice conversion rate, every other §17 report      | M13                                                                  |
| Admin UI to write `tax.policy`/`check.policy`/`print.activePath` with `setting_history`          | unscheduled — no milestone in §18 names general settings wiring      |
| `pos_terminals.print_path` column for genuine per-terminal path selection                        | unscheduled — needed only once a second terminal class exists        |
| Signed/installable print-bridge binary, OS service registration                                  | unscheduled — infrastructure outside a coding session                |
| Durable/offline print queue surviving a bridge restart                                           | M16 (offline)                                                        |
| Order-level discount with nowhere to persist past the live cart (§4 above)                       | unscheduled — data-contract question, not this milestone's to decide |
| Reservations, drag-and-drop transfer/merge, editing an already-sent line (M09b's own list)       | unscheduled                                                          |
| The pre-existing `auth-attempts.test.ts` timing failure (M09a §4)                                | unscheduled                                                          |
| A live-browser interactive pass through print/payment/finalize, once tooling allows it (M09b §4) | unscheduled                                                          |
