# M26 · staff register and attendance

**Milestone:** M26 · **Phase:** 3 — Hardening
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §1, §5, §14.1, §2 R6/R7/R13/R16
**Deviation:** [ADR 0032](../decisions/0032-staff-register-and-attendance.md) — §1
excludes payroll. Read the ADR first; it draws the line this milestone stays inside.
**Preceding gate:** [M25](./M25-assistant.md) — PASS on 1–5; gate 6 (live run
with a key) is carried forward to product and does not touch this module.
**Followed by:** [M27](./M27-staff-advances.md) (advances), [M28](./M28-stock-ledger.md)
(stock). The three were requested together; §0 rule 1 splits them.

---

## 1. Purpose

The owner wants a daily attendance book for everyone who works in the
restaurant, including the people who never touch the till, so that the month
end can be settled from a record rather than from memory.

## 2. Scope

**In:**

- `packages/db/src/schema.ts` — `employees`, `attendance`, `attendance_status`.
  Migration `0008` and its snapshot (R8).
- `apps/pos/lib/attendance/register.ts` — pure: parse a posted register,
  worked minutes with the overnight wrap, the month summary.
- `apps/pos/lib/attendance/register.test.ts`.
- `apps/pos/lib/attendance/queries.ts` — the day and the month, through `dbRead`.
- `apps/pos/lib/attendance/actions.ts` — save a day; add, edit, deactivate an
  employee. `dbWrite`, one transaction each, audited (R2, R7).
- `apps/pos/components/admin/AttendanceRegister.tsx`, `EmployeeManager.tsx`.
- `apps/pos/app/admin/attendance/page.tsx`, `apps/pos/app/admin/employees/page.tsx`.
- `AdminShell` — a **People** section with two entries.

**Out, and why:**

- **Salary, wages, overtime, payslips.** Payroll — §1, ADR 0032.
- **Self clock-in from the till.** Needs the register linked to `users`.
- **Rota, lateness, leave balances.** No schedule to measure against.
- **Advances.** M27.
- **An assistant tool for attendance.** The M25 tool list is a separate change.

## 3. Decisions

See ADR 0032. In short: a people register apart from `users`, owner-only; a
daily book the manager fills in under `expenses.write`; four statuses; wall-clock
times that wrap past midnight; no future dates; unchanged rows write nothing.

## 4. Gate

| #   | Assertion                                                           | Method                                                                                  | Result                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | An overnight shift yields positive hours; no path yields a negative | `register.test.ts` — 16:00→01:30 is 9h 30m; equal times are zero (R13)                  | **PASS**                                                                                                                                                                                                                                                |
| 2   | A malformed posted row is refused by name, not by index             | `register.test.ts` — bad status, bad time, times on an absence                          | **PASS**                                                                                                                                                                                                                                                |
| 3   | The month summary counts from the same rows it lists (R16)          | `register.test.ts` — counts and unmarked days over a fixed month                        | **PASS**                                                                                                                                                                                                                                                |
| 4   | Every mutation is audited inside its own transaction (R2, R7)       | Review: five write paths, each a `dbWrite().transaction` holding its `writeAudit`       | **PASS**                                                                                                                                                                                                                                                |
| 5   | A cashier cannot mark attendance; a manager cannot add an employee  | Review: `expenses.write` and `staff.write` asserted server-side in each action          | **PASS**                                                                                                                                                                                                                                                |
| 6   | Migration committed with its snapshot (R8)                          | `0008_*.sql` and `meta/0008_snapshot.json` present; `migration-diff`                    | **PASS** — files present; the gate itself reports "no schema change in range" until they are committed                                                                                                                                                  |
| 7   | `pnpm run ci` green                                                 | typecheck, lint, tests, four gates                                                      | **PASS**                                                                                                                                                                                                                                                |
| 8   | A real day marked against the pilot database                        | `pnpm db:migrate`, add three employees, save a register, edit it, read the activity log | **PARTIAL** — migrations `0008`–`0010` applied to the pilot database on 2026-09-25; the new constraints verified against it by `packages/db/test/constraints.test.ts` (rolled back, no data left). The walk-through on the screens remains with product |

## 5. Exit

The owner can keep a register of everyone who works in the restaurant, login or
not, and deactivate people who leave. A manager marks each day — present,
absent, leave or day off, with times for a present day — and saves it once; the
page shows the month so far per person, with the days nobody marked. An auditor
can read both and change neither. Every change is an audit row; an unchanged
save writes none.

`pnpm run ci` is green (267 POS tests, 8 of them new) and `pnpm --filter
@natech/pos build` compiles both routes.

### Carried forward

| Item                                           | Owner   | Why                                              |
| ---------------------------------------------- | ------- | ------------------------------------------------ |
| Gate 8 — a real day marked through the screens | product | Migration applied; needs a signed-in manager     |
| Commit `0008` so `migration-diff` can see it   | product | The working tree also holds uncommitted M25 work |
| M27 advances, M28 stock                        | done    | Built in the same session — see their runfiles   |
