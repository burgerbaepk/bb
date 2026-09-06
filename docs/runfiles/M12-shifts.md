# M12 · shifts

**Milestone:** M12 · **Phase:** 2 — Wiring
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §5.9, §6.13, §12, §17, §2 R4/R7/R16, §14.1
**Preceding gate:** [M11](./M11-fiscal.md) — all fourteen gate criteria PASS; `docs/runfiles/M11-fiscal.md` §6 names M12 as next

---

## 1. Purpose

`shifts`/`cash_movements` were built in M02, unused since. `ShiftReportSchema`,
`CashMovementRowSchema`, and `PaymentMixRowSchema` were built in M06 and have
sat behind `MOCK_SHIFT_REPORT` on `/admin/reports/shift`. `packages/db/seeds/
roles.ts` already plants the one instruction this milestone has to act on:
CASHIER holds `shift.close` for "their own shift" — a scope, not a separate
permission, because the frozen `PermissionSchema` has exactly one shift
permission — and its comment says outright: "M12 must check that the shift
being closed belongs to the cashier closing it."

M12 is the till's cash lifecycle: open a shift (manually, or by the
store-hours cron), record pay-ins/pay-outs/drops against it, close it with a
cash count and a computed variance, and produce the X (mid-shift) and Z
(closing) report — the same figures on screen and in the Resend email, by
construction. It also produces the one figure the system being replaced has
no way to produce: check-to-invoice conversion, per shift and per cashier
(§6.13).

---

## 2. Scope

**In:**

- `packages/domain/src/state-machines/shift.ts` — `OPEN → CLOSED`, terminal,
  added to the existing `state-machines.test.ts` (R4).
- `apps/pos/lib/shifts/queries.ts` — the current open shift (or the most
  recently closed one) for `/shift` and the admin report's default; outlet
  store-hours reads for the auto-open cron.
- `apps/pos/lib/shifts/report.ts` — `readShiftReport(shiftId)`, one function
  building the `ShiftReport` shape for both an open shift (`kind: 'X'`) and a
  closed one (`kind: 'Z'`); `sendZReportEmail`, mirroring `lib/fiscal/
reconciliation.ts`'s Resend shape exactly (same skip-rather-than-throw guard
  when `RESEND_API_KEY`/`outlet_config.email` are absent).
- `apps/pos/lib/shifts/actions.ts` — `openShiftAction`, `recordCashMovementAction`,
  `closeShiftAction` (computes variance, closes, emails the Z report).
- `apps/pos/lib/shifts/autoOpen.ts` — the auto-schedule logic; `apps/pos/app/
api/cron/shift-auto-open/route.ts`, `CRON_SECRET`-gated like M11's two cron
  routes; `apps/pos/vercel.json` scheduled every 15 minutes.
- `apps/pos/app/(terminal)/shift/page.tsx` + `apps/pos/components/shift/*` —
  the till screen: open (float entry), pay-in/pay-out/drop, close (cash
  count, variance preview).
- `apps/pos/components/shell/PosShell.tsx` / `(terminal)/layout.tsx` — a
  "Shift" nav entry, badged open/closed.
- `apps/pos/app/admin/reports/shift/page.tsx` rewritten as a server component
  reading `readShiftReport`; the existing JSX extracted unchanged into
  `apps/pos/components/admin/reports/ShiftReport.tsx` (mirrors M11's
  `ComplianceDashboard` extraction) so the mock→real swap touches props, not
  markup.

**Out:**

- **Every other §17 report.** `/admin/reports/{sales,tax,floor,exceptions,
auditor}` stay on mock data — M13's scope line, unchanged by this milestone,
  matching M11's own precedent of leaving reports it did not own alone.
- **A shift picker / shift history browser.** The admin page shows the
  current shift live (open → X, most recently closed → Z). Browsing past
  shifts is reporting-history territory — M13, same as a credit-note lookup
  screen was M11's own carried-forward item for the identical reason.
- **Gating orders, checks, or payments on a shift being open.** Not named in
  the milestone line (`open and close, auto-schedule, pay-in, pay-out, drop,
variance, X and Z reports via Resend, check-to-invoice conversion`), and
  every figure this milestone reports is computed by time-window against
  `payments`/`invoices`/`order_checks`, independent of whether a `shifts` row
  exists to "cover" them. Adding a hard gate risks regressing M07–M11 flows
  for a requirement the plan does not state.
- **A `packages/contracts` change.** Everything this milestone needs already
  exists in the frozen contract (`ShiftReportSchema`, `CashMovementRowSchema`,
  `PaymentMixRowSchema`) or is local to `apps/pos` (action inputs, the current-
  shift view for the till header) — the same category `FinalizeOrderInputSchema`
  and `TillIdentity` already sit in, not `packages/contracts`. See §3.
- **A partial-unique DB constraint enforcing one open shift at a time.** The
  frozen schema (M02) has none; adding one is a migration this milestone was
  not asked to write. Enforced at the app layer instead — see §3.

---

## 3. Decisions

**No `packages/contracts` change; the freeze holds.** ADR 0008 permits an
addition when a decision record states what surface required it and why the
existing shape could not answer — but nothing here clears that bar. The one
shared, cross-surface shape this milestone needs (the X/Z report) already
exists, built in M06 for exactly this screen. Everything else — action
inputs, the till's "current shift" view — is single-app and local, the same
category `FinalizeOrderInputSchema` (`lib/payments/actions.ts`) and
`TillIdentity` (`lib/auth/session.ts`) already occupy without ever being
contracts.

**`shift.close` gates the whole shift surface — open, cash movements, and
close — not only closing.** The frozen `PermissionSchema` has exactly one
shift-shaped permission. WAITER holds none of it and should not be moving
till cash regardless of which of the three actions is in question; CASHIER
and MANAGER hold it identically per the §14.1 role table. Naming it
`shift.close` in the contract was a Phase-1 choice about which word to freeze,
not a scope limit on what it gates.

**"Own shift" (§14.1, CASHIER) means own _manually_ opened shift.**
`roles.ts`'s planted comment says to check that the shift being closed belongs
to the cashier closing it — literal ownership only makes sense where a person
did the opening. An auto-opened shift (`openedBy: null`, §14.6 below) belongs
to nobody in particular, so any CASHIER or MANAGER holding `shift.close` may
act on it. The check, applied uniformly to open/cash-movement/close: refuse a
CASHIER acting on a shift with `openedBy !== null && openedBy !== viewer.id`.
MANAGER and OWNER are never restricted (OWNER via the wildcard `can()` already
expands; MANAGER per §14.1's own "shift close" line naming no such limit).

**Auto-schedule reuses `outlet_config.storeOpen`/`storeClose`/`weeklyOffDays`
— fields the frozen schema (M02, §5.1) already carries — rather than a new
settings key.** The plan's M12 line lists "auto-schedule" beside "open and
close" as its own feature, and the `shifts.mode` enum already anticipated it
(`'MANUAL' | 'AUTO'`, M02). A cron mirroring M11's own `fiscal-outbox`/
`fiscal-reconciliation` shape (`CRON_SECRET`-gated `GET`, scheduled in
`vercel.json`) runs every 15 minutes: if no shift is `OPEN`, and the outlet's
local time falls within `storeOpen`–`storeClose` (open-ended past `storeOpen`
if `storeClose` is unset), and today is not a `weeklyOffDays` day, it opens
one with `mode: 'AUTO'`, `openedBy: null`, `openingFloat: 0` — the schema's
own column default, not a figure this milestone invents. A shift closed
mid-day and still within hours is picked back up by the next tick; that is
the intended behaviour, not a bug — the till should have an open shift
through opening hours so a cash payment is never taken outside one.

**No opening-float carry-forward from the previous shift's counted cash.**
Considered and rejected: the previous shift's `countedCash` can be null (an
improperly closed shift) or simply wrong, and inventing a fallback chain for
that is more logic than the schema's own `default 0` plus a same-day PAY_IN
if the till really did start with float in the drawer.

**Single-open-shift is enforced at the app layer, not the database.**
`shifts_open_idx` (M02) is a lookup index, not a uniqueness constraint, and
the frozen schema adds none. `openShiftAction`/the auto-open cron each check
for an existing `OPEN` row inside their own write before inserting.
`# ponytail: no row-level lock across the check-then-insert — a same-instant
double-open race is a real gap, not closed here; upgrade to a `shifts` partial
unique index (a migration, R8) only if a double-open is ever actually
observed.` Mirrors M11's own accepted-risk framing for its Redis lease
(`lease.ts` §3).

**checksPrinted counts one row per order — the order's current, non-superseded
check — not every print event.** Reusing `readOpenChecksForCompliance`'s own
filter (`isSuperseded = false`, not deleted) rather than counting reprints as
additional denominator: a table reprinted five times because of a card
decline is one check that either does or does not become an invoice, and
counting the reprints separately would punish exactly the §6.5 method-mismatch
path the system is supposed to handle gracefully. `invoiceCount` counts
`invoices.finalizedAt` in the window directly, independent of checks.

**Per-cashier conversion attributes both figures to the check's own
`printedBy`**, joining `invoices.finalCheckId → order_checks.printedBy` for
the numerator — not `invoices.finalizedBy`. §6.13's own framing ("a cashier
who prints thirty checks and finalizes twenty-two") is about the person who
put a document in a customer's hand, which is the printer, not necessarily
whoever happened to key in the payment. An invoice with no `finalCheckId`
(finalize without ever printing a check — `finalCheckId` is nullable, and
`finalizeOrderAction` already permits it) counts in the shift total but not
in any cashier's row, since there is no check to attribute it to.

**netSales/taxCollected on the shift report are `SUM(invoices.taxableBase)`/
`SUM(invoices.taxTotal)`** over the window — the same two column names the
invoice schema itself already uses for these figures (§6.3), rather than
inventing a different aggregate (e.g. grand total, or subtotal before
discount).

**Cash movements require a reason, no supervisor PIN.** The plan requires a
reason code and supervisor PIN for voids and above-threshold discounts (§6.8,
§8) and says nothing of the kind for pay-in/pay-out/drop; adding a PIN step-up
nothing asked for is scope this milestone was not given. The permission
(`shift.close`, ownership-checked) is already restricted to CASHIER/MANAGER/
OWNER.

---

## 4. Gate

| #   | Criterion                                                                                                                                                                                                                    | Verified by                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Result   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| G1  | Shift lifecycle: `OPEN → CLOSED`, terminal, rejects any transition out of `CLOSED`                                                                                                                                           | `packages/domain/test/state-machines.test.ts` (4 new cases, "R4 — the shift lifecycle")                                                                                                                                                                                                                                                                                                                                                                                                                  | **PASS** |
| G2  | Open: manual (float entry, `shift.close`-gated) and auto (store-hours cron, `mode: 'AUTO'`, `openedBy: null`) both write a single `OPEN` row; a second open while one is already open is refused                             | code review of `openShiftAction`/`autoOpenShiftIfDue`                                                                                                                                                                                                                                                                                                                                                                                                                                                    | **PASS** |
| G3  | Cash movements: PAY_IN/PAY_OUT/DROP, reason required, `shift.close` + ownership-gated, audited                                                                                                                               | code review of `recordCashMovementAction`                                                                                                                                                                                                                                                                                                                                                                                                                                                                | **PASS** |
| G4  | Close: cash count required, `expectedCash`/`variance` computed server-side from real `payments`/`cash_movements`, never client-supplied; CASHIER blocked from a MANUAL shift it did not open, never blocked from an AUTO one | code review of `closeShiftAction`                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | **PASS** |
| G5  | X and Z reports: `readShiftReport` produces the frozen `ShiftReport` shape correctly for an open shift (`kind: 'X'`, `closedAt: null`) and a closed one (`kind: 'Z'`) from the same function                                 | code review; live boot of `/admin/reports/shift` and `/shift`                                                                                                                                                                                                                                                                                                                                                                                                                                            | **PASS** |
| G6  | Check-to-invoice conversion: shift-wide and per-cashier, matching §3's attribution rule                                                                                                                                      | code review of `report.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | **PASS** |
| G7  | Z report emailed via Resend on close, mirroring `reconciliation.ts`'s skip-not-throw guard                                                                                                                                   | code review of `sendZReportEmail`                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | **PASS** |
| G8  | R7 — an audit row for open, each cash movement, and close                                                                                                                                                                    | code review                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | **PASS** |
| G9  | R16 — the admin report's header figures and its tables derive from the same `readShiftReport` call, not a second query                                                                                                       | code review                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | **PASS** |
| G10 | No `packages/contracts` change                                                                                                                                                                                               | `git diff --stat packages/contracts/src` — empty                                                                                                                                                                                                                                                                                                                                                                                                                                                         | **PASS** |
| G11 | Workspace green: typecheck, lint, test, build, gates, live boot                                                                                                                                                              | `pnpm typecheck`/`lint` (15/15 packages), `pnpm test` (all packages green, `@natech/pos` 187/187, `@natech/domain` 261/261 at 100% branch coverage), `pnpm build` (Turbopack, all 32 `apps/pos` routes incl. `/shift` and the new cron route), `pnpm gates` (all four), live boot — `/`, `/floor`, `/shift`, `/admin/reports/shift` all 307 to `/sign-in`; `/api/cron/shift-auto-open` 500 (no `CRON_SECRET` in this environment), identical to the two existing M11 cron routes in the same environment | **PASS** |

**Disclosed gaps (anticipated, same class as M09b/M10/M11's own precedent):**

1. No DB-backed integration test for the shift actions or the auto-open cron
   — the established house position since M10 (§4 of that runfile): no
   milestone through M11 wrote one for a server action; `packages/domain`
   (pure) gets the state-machine unit test, the DB orchestration does not.
2. No live-browser interactive pass through open → pay-in → close → emailed Z
   report. No browser-automation tool available this session.
3. The Resend send is not exercised against a real account in this
   environment (no `RESEND_API_KEY`) — verified by code review and the guard
   that skips rather than throws, matching `reconciliation.ts`'s own disclosed
   gap.

---

## 5. Exit

- [x] All gate criteria pass, with the disclosed gaps above
- [x] No change to `packages/contracts/src` — the freeze holds
- [ ] **Next: M13 · reporting**

### Carried forward

| Item                                                                                                                                    | Milestone                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Every other §17 report (sales, item, category, channel, tax liability, floor performance, exceptions, PRA return support, auditor pack) | M13                                                           |
| A shift picker / shift history browser                                                                                                  | unscheduled, reporting-history territory — M13 or later       |
| Server-side Excel/PDF/CSV export (`ReportShell`'s own buttons, all reports including this one)                                          | M13                                                           |
| A `shifts` partial-unique constraint closing the same-instant double-open race                                                          | unscheduled — only if a double-open is ever actually observed |
| The pre-existing `auth-attempts.test.ts` timing failure (M09a §4)                                                                       | unscheduled                                                   |
| A live-browser interactive pass, once tooling allows it                                                                                 | unscheduled, carried since M09b/M10/M11                       |
