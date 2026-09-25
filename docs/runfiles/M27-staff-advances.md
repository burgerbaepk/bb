# M27 · staff advances

**Milestone:** M27 · **Phase:** 3 — Hardening
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §1, §5.9, §2 R1/R6/R7/R16
**Deviation:** [ADR 0033](../decisions/0033-staff-advances.md) — §1 excludes
payroll. Read the ADR first.
**Preceding gate:** [M26](./M26-attendance.md) — PASS on 1–7; gate 8 (a live
day on the pilot database) is carried forward to product, as M25's gate 6 was.
**Session note:** started in the same session as M26, on the product owner's
explicit instruction to continue building. §0 rule 1 says one milestone per
session; this runfile records that the rule was overridden, not forgotten.

---

## 1. Purpose

Record the advances paid to staff and what has come back, per person, so the
month end knows what is owed. When the advance comes out of the till, the
drawer must reconcile.

## 2. Scope

**In:**

- `packages/db/src/schema.ts` — `staff_advances`, `staff_advance_kind`
  (`ADVANCE`, `RECOVERY`), `staff_advance_method` (`SALARY_DEDUCTION`,
  `CASH_RETURN`). Two `CHECK`s. Migration `0009` and its snapshot (R8).
- `apps/pos/lib/advances/balance.ts` — pure: the balance, the entry rules.
- `apps/pos/lib/advances/balance.test.ts`.
- `apps/pos/lib/advances/queries.ts` — balances per person and ninety days of
  entries, through `dbRead`.
- `apps/pos/lib/advances/actions.ts` — one action that records an advance or a
  recovery, with its till `PAY_OUT`/`PAY_IN` when the cash went through the
  drawer, in one transaction with both audit rows (R2, R7).
- `apps/pos/components/admin/AdvanceLedger.tsx`, `apps/pos/app/admin/advances/page.tsx`.
- `AdminShell` — **Advances** in the People section.

**Out, and why:**

- **Salary, deduction schedules, instalments, payslips.** Payroll — ADR 0033.
- **Edits and deletes.** Counter-entries only; a deleted advance whose
  `PAY_OUT` sits in a closed shift would unbalance a reconciled drawer.
- **Approval.** Nobody has been asked to sign one.
- **An entry point on the till screen.** The till's own pay-out still exists
  for money that is not an advance; an advance is recorded here, by a manager.
- **An assistant tool for balances.** A change to M25's tool list.

## 3. Decisions

See ADR 0033. In short: one table; the balance derived, never stored; a till
entry writes its cash movement in the same transaction and must be dated today;
no recovery beyond the balance, checked under `FOR UPDATE` on the employee;
not an expense; counter-entries only.

**One action, not four.** Advance-in-cash, advance-by-transfer, recovery by
deduction and recovery in cash differ by two fields. Four actions would be four
copies of the same lock, balance check and audit, and the fifth variant added
later is the one that forgets the lock.

## 4. Gate

| #   | Assertion                                                           | Method                                                                                          | Result                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Balance is exact paisa over mixed entries                           | `balance.test.ts`                                                                               | **PASS**                                                                                                                                                                                                                                                |
| 2   | A recovery above the balance is refused; the entry rules hold       | `balance.test.ts` for the rules; `FOR UPDATE` on the employee in the action                     | **PASS**                                                                                                                                                                                                                                                |
| 3   | A till advance lowers `computeExpectedCash()` by exactly its amount | Review: a `PAY_OUT` of the same `amount` on the open shift, which `reconciliation.ts` nets      | **PASS**                                                                                                                                                                                                                                                |
| 4   | A till entry with no open shift, or not dated today, is refused     | Review: both return a refusal before anything is written                                        | **PASS**                                                                                                                                                                                                                                                |
| 5   | Advances do not appear in `expenses`                                | Review: the action never touches `expenses`                                                     | **PASS**                                                                                                                                                                                                                                                |
| 6   | Every mutation audited in its transaction (R7)                      | Review: the entry row and its cash movement each get a `writeAudit` inside one `dbWrite` tx     | **PASS**                                                                                                                                                                                                                                                |
| 7   | Migration committed with its snapshot (R8); `pnpm run ci` green     | `0009_*.sql`, `meta/0009_snapshot.json`; CI                                                     | **PASS** — 274 POS tests, 7 new; `migration-diff` sees `0009` once committed                                                                                                                                                                            |
| 8   | A till advance on the pilot database, then close the shift          | `pnpm db:migrate`, pay an advance from the till, close the shift, check expected cash and email | **PARTIAL** — migrations `0008`–`0010` applied to the pilot database on 2026-09-25; the new constraints verified against it by `packages/db/test/constraints.test.ts` (rolled back, no data left). The walk-through on the screens remains with product |

## 5. Exit

A manager can record an advance to anyone on the active register and a
recovery from anyone who still owes, by salary deduction or cash. Cash that
goes through the drawer writes its `PAY_OUT` or `PAY_IN` on the open shift in
the same transaction, so the shift report and the Z-report email list it with
the person's name. The page shows each person's advanced, recovered and
outstanding figures and ninety days of entries. Nothing can be edited or
deleted.

### Carried forward

| Item                                          | Owner     | Why                                                                                           |
| --------------------------------------------- | --------- | --------------------------------------------------------------------------------------------- |
| Gate 8 — a till advance, then close the shift | product   | Migration applied; needs a signed-in manager and an open shift                                |
| Till pay-out racing a shift close             | **fixed** | `recordCashMovementAction` now takes the same `FOR UPDATE` on the shift as `closeShiftAction` |
