# 0033 — a staff advance book, and why it is not payroll or an expense

**Status:** accepted
**Date:** 2026-09-25
**Milestone:** [M27](../runfiles/M27-staff-advances.md)
**Depends on:** [ADR 0032](0032-staff-register-and-attendance.md) — the `employees` register.
**Touches:** BUILD-PLAN.md §1 (_payroll_). One new table, one new enum. No
frozen contract changes.

## Context

Staff in the restaurant are paid an advance against their salary: a few
thousand rupees mid-month, often in cash from the till, recovered from the next
salary or occasionally handed back. Today it is a page in a notebook, and the
till drawer comes up short by exactly that amount with nothing on the system
to say why.

Decided with the product owner on 2026-09-25: an advance paid from the till
must also appear in the drawer's reconciliation.

## Decision

**A ledger per person, not a payroll.** One table, `staff_advances`, one row
per movement:

- `kind` — `ADVANCE` (money to the employee) or `RECOVERY` (money back).
- `method` — for a recovery, `SALARY_DEDUCTION` or `CASH_RETURN`; for an
  advance, null.
- `amount` — positive paisa (R1), a `CHECK (amount > 0)`. A second `CHECK`
  holds `method` null on an advance and set on a recovery.
- `cash_movement_id` — the till movement this entry caused, if any. There is
  no separate `from_till` flag: a flag and a link can disagree, and the link
  cannot.
- `occurred_on`, `note`, `recorded_by`.

The outstanding balance is `Σ ADVANCE − Σ RECOVERY`, derived and never stored.
A stored balance is a second copy of the truth, and the two copies disagree the
first time a write fails halfway.

**Paid from the till means a `PAY_OUT` in the same transaction.** When the form
says "paid from the till", the action writes a `cash_movements` row of type
`PAY_OUT` against the open shift, with the reason `Staff advance — <name>`, and
links it from the advance row. `computeExpectedCash()` already nets `PAY_OUT`,
so the drawer reconciles with no change to M12's code. No open shift means the
till cannot have paid it, and the action refuses. A `CASH_RETURN` recovery
into the till is the mirror: a `PAY_IN`. A till entry must carry today's
business date — a movement in tonight's drawer dated last Tuesday makes both
books wrong — and a `SALARY_DEDUCTION` never touches the till.

**The payee must be on the active register; a recovery need not be.** An
advance to somebody who has left is refused. A leaver repaying what they owe
is the common case for a recovery, and is allowed.

**An advance is not an expense.** It is money the restaurant expects back.
Writing it to `expenses` would count it twice: once when advanced, and again
when the full salary is paid and recorded as an expense. The expense ledger
keeps meaning "money spent".

**No recovery beyond the balance.** A recovery larger than what is outstanding
is refused. The check runs inside the transaction after a `SELECT … FOR UPDATE`
on the employee row, so two recoveries saved at once cannot both pass it.

**No edit and no delete.** A wrong entry is corrected by a counter-entry, as
R5 treats the invoice and M23 treats a submitted demand sheet. An advance
linked to a `PAY_OUT` in a shift that has since closed cannot be deleted
without rewriting a reconciled drawer, and a rule that holds for only some rows
is a rule nobody remembers.

**`expenses.write` for every write, `reports.read` to read**, as M23 and M26.
The register is owner-only (ADR 0032), so a manager can pay an advance but
cannot create the person it is paid to.

## What this specifically does not build

- **Salary, deduction schedules, instalments, interest.** A `SALARY_DEDUCTION`
  row records that a deduction happened, not how the salary was worked out.
- **An approval step.** The owner reads the ledger and the activity log. A
  second signature can be added when somebody is asked to give one.
- **A payslip.** Payroll.

## Consequences

- The shift report's movement list shows the advance with its reason, so a
  short drawer explains itself.
- The dashboard's expense figure is unchanged by advances, by design.
