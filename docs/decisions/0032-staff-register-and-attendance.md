# 0032 — a staff register and a daily attendance book, and where they stop being payroll

**Status:** accepted
**Date:** 2026-09-25
**Milestone:** [M26](../runfiles/M26-attendance.md)
**Touches:** BUILD-PLAN.md §1's _Do not build_ list, which names **payroll**.
Two new tables (`employees`, `attendance`), one new enum (`attendance_status`),
migration `0008`. No frozen contract changes ([ADR 0008](0008-phase-1-data-contracts.md)
holds — no `PermissionSchema` change, no view model change).

## Context

The product owner asked for three things at once: staff attendance, staff
advance payments, and stock management. This ADR covers the first, and the
staff register the second one also needs. [ADR 0033](0033-staff-advances.md)
and [ADR 0034](0034-stock-ledger.md) cover the other two; they are separate
milestones because §0 rule 1 allows one per session.

Two facts about the restaurant shape the design.

**Most of the people who work there have no login.** `users` is the table of
people who operate the till and the back office, and each row needs an email.
The cooks, the riders, the dishwasher and the cleaner have none, and giving
them one to mark them present would put a dozen dormant credentials on the
system — accounts nobody logs into are the ones nobody notices being used.

**Attendance is the input to payroll, which §1 excludes.** The owner wants the
book so they can pay people correctly at the end of the month. The moment the
system multiplies days by a daily rate, it is a payroll module, and a payroll
module that is wrong about one deduction is worse than the paper.

## Decision

**A staff register separate from `users`.** `employees` is a list of people:
name, job title, phone, active. It has no email, no password and no role, and
it is not linked to `users`. Somebody who both operates the till and is marked
present appears in both tables, which is honest: one is a credential, the other
is a person on the payroll sheet.

**The register is owner-only.** Writes need `staff.write`, which only OWNER
holds — the same grant as `/admin/staff`. That is not tidiness. M27 pays
advances against this register, and the classic fraud against a staff advance
book is the ghost employee: the person who marks attendance also invents a
worker and pays them. Keeping the list of people with the owner, and the daily
marking with the manager, splits the two duties the fraud needs.

**The attendance book is the paper register, and nothing more.** One row per
person per business date: a status, optionally a time in and a time out, and a
note. The manager fills in the day; the owner reads the month.

| The book records                         | It does not, and must not, record  |
| ---------------------------------------- | ---------------------------------- |
| Bilal was present on 25 September        | What Bilal is paid                 |
| In at 16:00, out at 01:30                | Whether 01:30 was overtime         |
| Absent on the 26th                       | What an absence costs him          |
| 24 present, 2 absent, 4 off in September | What September's salary sheet says |

The left column is a statement about what happened. The right column is a
statement about money owed, and each cell needs rules — rates, overtime,
deductions, leave entitlement — that belong to a payroll system.

**Four statuses.** `PRESENT`, `ABSENT`, `LEAVE` (agreed time off) and `OFF`
(the weekly day off). No `HALF_DAY` and no `LATE`: each is a pay rule dressed as
a status, and "late" also needs a rota to be late against, which does not exist.

**Times are wall-clock `time`, not `timestamptz`.** The register says "16:00",
not an instant. A shift that ends after midnight is the ordinary case in this
restaurant, so the worked time wraps: out earlier than in means out is on the
next day. That keeps the hours non-negative, so R13 holds without a clamp.

**Future dates are refused.** A register filled in ahead of time records
nothing that happened. Marking planned leave next week is a rota, and a rota is
out of scope.

**The daily marking uses `expenses.write`.** The frozen contract has no
attendance permission, and M23 already established `expenses.write` as the
grant for manager-authored operating records: OWNER and MANAGER hold it,
CASHIER and WAITER do not, so a cashier cannot mark their own attendance.
`reports.read` shows the page, so AUDITOR can read the book and change nothing.

## What this specifically does not build

- **Salary, wages, rates, overtime, payslips.** Payroll, by name.
- **Self clock-in on the till.** It needs the register linked to `users`, and a
  PIN for staff who have no account. Add it on the day somebody asks for it.
- **A rota or shift schedule.** Nothing to be late against, so nothing is late.
- **Leave balances or entitlement.** `LEAVE` records that someone was off with
  agreement, not whether they had any days left.

The next request will be "can it work out the salary?". The answer is ADR 0033's
boundary, not a column on this table.

## Consequences

- `employees` and `attendance`, both soft-deleted (R6), both audited (R7).
  `attendance` has a partial unique index on `(employee_id, business_date)`, so
  a day holds at most one row per person, and two managers saving the same day
  at once get a refusal rather than a duplicate.
- Clearing a status soft-deletes the row, with an `ATTENDANCE_CLEARED` audit
  row. An edit writes `ATTENDANCE_CHANGED` with before and after. Unchanged
  rows in a saved register write nothing, so the audit trail shows what
  actually changed that day and not fifteen rows of "still present".
- The save is one transaction over the whole day and carries no idempotency
  key (R3). It does not need one: every row is keyed on the natural pair
  `(employee, date)` and compared before it is written, so replaying the same
  form converges on the same state and writes no second audit row. The M24
  demand grid takes the same position for the same reason.
- A deactivated employee drops off the blank register but stays on any date
  they already have a row for, so past registers still read as written.
