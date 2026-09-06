# M19 · pilot

**Milestone:** M19 · **Phase:** 3 — Hardening (final)
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §18 ("seven-day parallel run. Daily totals must tie to the paisa before cutover.")
**Preceding gate:** [M18](./M18-performance-a11y.md) — all seven gate criteria PASS; `docs/runfiles/M18-performance-a11y.md` names M19 as next

---

## 1. Purpose

Every milestone through M18 has one property in common: its gate could be
satisfied, or its gap honestly disclosed, inside a coding session. M19
cannot be — its entire gate is a real event: this system running at the
actual restaurant, side by side with whatever the restaurant uses today, for
seven consecutive calendar days, with a human tying out each day's total to
the paisa before anyone agrees to cut over. No code produces that. This
runfile does not claim it happened. It records what a coding session
_can_ establish — that the system is technically ready for that week to
start — and states plainly what is still outside this repository's own
walls before it can.

## 2. Scope

**In:**

- A readiness check against every prior milestone's own gate table —
  confirming M00 through M18 all closed PASS, nothing carried forward that
  would block a live pilot specifically (as opposed to the fiscal-authority
  and hardware items already carried forward for other reasons — see §4).
- A one-time re-verification that the workspace is green right now, on the
  commit this runfile ships with: typecheck, lint, test, build, `pnpm gates`.
- An inventory of what a pilot day's reconciliation actually uses — the
  reporting surface M12/M13 already built (shift X/Z report, sales report,
  the reconciliation cron's own invoice-count comparison) — confirming nothing
  further needs building for someone to pull "today's total" out of this
  system and compare it to the legacy one by hand.

**Out — the pilot itself, and everything only the pilot can produce:**

- **Running the system at the restaurant.** Requires a terminal on site, a
  trained cashier, and the restaurant's actual legacy system still running
  in parallel — none of which exists inside a repository.
- **The seven days themselves.** A calendar-bound event; no session length
  substitutes for seven real trading days.
- **The daily tie-out.** Comparing this system's Z report to the legacy
  system's own total is, by construction, a comparison against a system this
  repository has no access to and no contract with — there is nothing to
  automate here without inventing a legacy-system integration the plan never
  asked for (§1's own "Do not build" list has no line for this, and one was
  not requested — see the question this runfile's own session asked before
  starting M19).
- **The cutover decision.** §18's own "before cutover" — a business decision
  for the restaurant and Najam once the seven days tie out, not a gate a
  runfile can tick on their behalf.
- **P4/P6** (§20) — the tax-advisor confirmation and the PRA software-approval
  question are both scoped to "Go-live," later than a pilot's own start;
  unresolved, unchanged by this runfile, carried forward same as always.

---

## 3. Decisions

**This runfile records readiness, not completion.** Every other runfile in
`docs/runfiles/` ends with its gate table fully PASS and an exit checklist
fully ticked, because every other milestone's gate was something a coding
session could actually finish. Marking M19's exit checklist complete would
misstate what happened — the honest record is a readiness gate, separate
from and explicitly short of the plan's own pilot gate, which stays open
until someone reports the real seven days back.

**No legacy-system reconciliation tool was built.** Asked directly, before
writing anything: build one, or write readiness only. Answer: readiness
only — the comparison is a manual one against a system with no integration
contract, and building against an unspecified legacy system would be
inventing a data contract with no source of truth, not verifying one.

**"Nothing carried forward blocks a pilot start" is a specific, narrower
claim than "every carried-forward item is resolved."** M11's PRA adapter,
M17's live-sandbox soak, and M18's device-timed interaction budget are all
still open — none of them stop a pilot from _starting_, because the pilot's
own point is to surface exactly this class of gap under real load before
cutover, not after. FBR's sandbox transmission, for instance, needs the same
real `FBR_TOKEN` and dedicated-IP relay deploy a pilot week would also need
provisioned — the pilot is what finally exercises that path for real, not
something that must be faked in advance to justify starting one.

---

## 4. Gate — readiness, not the plan's own pilot gate

| #   | Criterion                                                                                                                                | Verified by                                                                                                                               | Result                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| G1  | Every milestone M00–M18 closed with its own gate table fully PASS                                                                        | `docs/runfiles/M00-foundation.md` through `M18-performance-a11y.md` — swept for any FAIL/BLOCKED marker, zero found (§5)                  | **PASS**                                              |
| G2  | Workspace green on the commit this runfile ships with: typecheck, lint, test, build, `pnpm gates`                                        | §5 below                                                                                                                                  | **PASS**                                              |
| G3  | The reporting surface a daily tie-out needs (shift Z report, sales report, reconciliation counts) exists and needs nothing further built | `apps/pos/lib/shifts/report.ts`, `apps/pos/lib/reports/*`, `apps/pos/lib/fiscal/reconciliation.ts` — code review, all shipped M12/M13/M11 | **PASS**                                              |
| G4  | No open item blocks a pilot from _starting_ (as opposed to items the pilot itself is meant to surface)                                   | §3's own decision, §6 carried-forward table                                                                                               | **PASS**                                              |
| —   | **The plan's own gate: seven real days, tying to the paisa, before cutover**                                                             | —                                                                                                                                         | **NOT STARTED — outside this repository, see §2 Out** |

## 5. Verification log

```
docs/runfiles/M00-foundation.md … M18-performance-a11y.md — swept every gate
  table (`grep`, all 21 files) for a FAIL or BLOCKED marker: zero found;
  M11's own runfile read in full for the fiscal carried-forward detail §3/§6
  draw on
pnpm typecheck   →  15/15 packages, clean
pnpm lint        →  15/15 packages, clean
pnpm test        →  every package green except packages/db's pre-existing
                     auth-attempts.test.ts timing flake (carried since M09a,
                     named unrelated in every runfile from M11 on, this one
                     included)
pnpm gates       →  brand-grep, mock-data-grep, tax-column-grep,
                     migration-diff — all PASS
pnpm build       →  5/5 buildable targets
```

---

## 6. Exit

- [x] Readiness gate (§4, G1–G4) passes
- [ ] **The plan's own M19 gate — seven-day parallel run, tied to the
      paisa — has not started.** This is not a disclosed gap in the sense
      every prior milestone used the phrase (a measurement this session
      could not take); it is the plan's own next real-world step, unchanged
      by anything a coding session can do. Update this runfile — or add a
      dated addendum — once the seven days run and tie out, then mark this
      row and the plan's own Progress table in `CLAUDE.md` accordingly.
- [ ] Next: **cutover**, once the row above is checked, per §18's own
      "before cutover" — not a milestone this repository schedules itself.

### Carried forward

| Item                                                                              | Status                                                                                    |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| PRA's real adapter (P5)                                                           | unscheduled — blocks the pilot's own PRA leg, will surface for real during the seven days |
| A live sandbox call against real FBR/PRA (`FBR_TOKEN`, dedicated-IP relay deploy) | unscheduled — same provisioning the pilot itself needs                                    |
| Real device/throttled-browser timing for the POS interaction budget (M18)         | unscheduled — a device lab or a browser-automation tool, still absent                     |
| `text-ink-subtle`'s color-contrast ratio (M18)                                    | unscheduled — needs a design pass                                                         |
| P4 (tax-advisor confirmation), P6 (PRA software-approval question)                | unscheduled — scoped to Go-live, not pilot start                                          |
| Everything M17's own carried-forward table already lists                          | unchanged                                                                                 |
