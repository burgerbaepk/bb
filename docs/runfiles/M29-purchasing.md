# M29 · purchasing — suppliers, purchase orders, bills, payables

**Milestone:** M29 · **Phase:** 3 — Hardening
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §1, §2 R1/R2/R3/R4/R6/R7/R8/R9
**Deviation:** [ADR 0035](../decisions/0035-purchasing-and-suppliers.md) —
supersedes §1's _purchasing_ and _supplier management_ clauses. Read it first.
**Preceding gate:** [M28](./M28-stock-ledger.md) — PASS on 1–7; gate 8 carried
forward to product.
**Session note:** built in one session with [M30](./M30-customer-accounts.md)
and [M31](./M31-attendance-ease.md), on the product owner's explicit request
for all three at once. §0 rule 1 says one milestone per session; this runfile
records that the rule was overridden, as M26–M28 did, not forgotten.

---

## 1. Purpose

Record what the restaurant orders, what its suppliers bill, what it pays them
and what it still owes each one, with the goods on every bill booked into
stock, and report purchases by supplier and by item.

## 2. Scope

**In:**

- `packages/db/src/schema.ts` — `suppliers`, `purchase_orders`,
  `purchase_order_lines`, `supplier_bills`, `supplier_bill_lines`,
  `supplier_payments`; enums `purchase_order_status`, `supplier_bill_status`,
  `settlement_method`; `RETURNED` on `stock_movement_kind`. Migration `0011`
  and its snapshot (R8), shared with M30.
- `apps/pos/lib/purchasing/rules.ts` (+ test) — pure: line parsing, bill total,
  payables balance, the payment refusal shared with M30, the running statement.
- `apps/pos/lib/purchasing/queries.ts`, `actions.ts`.
- `apps/pos/lib/stock/book.ts` — the stock write helpers, moved out of a
  `'use server'` module so purchasing can call them without exposing them.
- `apps/pos/components/admin/purchasing/*` and pages `/admin/suppliers`,
  `/admin/suppliers/[id]`, `/admin/purchase-orders` (+ `new`, `[id]`),
  `/admin/purchases` (+ `new`, `[id]`).
- `AdminShell` — an **Accounts** section.
- A print rule for back-office documents (`print-document`, `no-print`).

**Out, and why:** see ADR 0035 — recipe costing and stock value, partial
deliveries, payment allocation and ageing, return documents, supplier
advances, an assistant tool.

## 3. Decisions

See ADR 0035. In short: owner-only supplier register; a PO is a request and a
bill is the fact; posting a bill writes the payable and the stock receipt in
one transaction and closes its PO; no edit — cancel with a reason, which
returns the stock and is refused if the stock is gone; payments against the
supplier, never above the balance, with a till `PAY_OUT` when paid from the
drawer; not an expense.

**A bill closes its PO.** The simplest rule that is never wrong: what did not
arrive is a new PO. Partial receipt per line is a later request.

**Idempotency keys come from the server page.** A client `randomUUID()` would
differ between the server render and hydration. The page mints one per render,
and revalidation after a successful payment delivers a fresh one.

## 4. Gate

| #   | Assertion                                                                           | Method                                                                                                  | Result                                                                                                                                                      |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Bill total and payables balance are exact paisa                                     | `rules.test.ts` — goods + charges − discount; opening + bills − payments; statement ends on the balance | **PASS**                                                                                                                                                    |
| 2   | Line parsing refuses by item name; duplicates refused, not merged                   | `rules.test.ts`                                                                                         | **PASS**                                                                                                                                                    |
| 3   | A payment above the balance, a cheque through the till, or old till cash is refused | `rules.test.ts` — `refuseSettlement`; the action calls it after `FOR UPDATE` on the supplier            | **PASS**                                                                                                                                                    |
| 4   | Posting a bill writes bill, lines, stock receipts, PO close, audit — or nothing     | Review: one `dbWrite` transaction, each line through `refuseMovement`, `withIdempotency` around it      | **PASS**                                                                                                                                                    |
| 5   | Cancelling refuses when stock is used; otherwise returns it                         | Review: `refuseMovement('RETURNED')` against the book read under lock, before any write                 | **PASS**                                                                                                                                                    |
| 6   | Owner-only register; manager bills and pays                                         | Review: `staff.write` in `saveSupplierAction`/`setSupplierActiveAction`; `expenses.write` elsewhere     | **PASS**                                                                                                                                                    |
| 7   | No tax column outside `invoices` (R9)                                               | `tax-column-grep`                                                                                       | **PASS**                                                                                                                                                    |
| 8   | Migration committed with its snapshot (R8); `pnpm run ci` green; build              | `0011_*.sql`, `meta/0011_snapshot.json`; CI (311 POS tests); `pnpm --filter @natech/pos build`          | **PASS**                                                                                                                                                    |
| 9   | A bill posted, paid from the till and cancelled on the pilot database               | `pnpm db:migrate`, then the screens                                                                     | **PARTIAL** — `0011` applied to the pilot database 2026-10-01 and verified (tables, `RETURNED`, the stock `CHECK`); the walk-through on the screens remains |

## 5. Exit

The owner adds suppliers. A manager raises a printable purchase order, enters
the supplier's bill against it (or on its own), and the goods appear in stock
and the amount in what is owed. Payments by cash, transfer, cheque or wallet
lower the balance; cash from the drawer is on the shift. Each supplier has a
printable statement with a running balance; the Purchases page reports a date
range by supplier and by item, with what was paid and what is owed now.

### Carried forward

| Item                                                   | Owner   | Why                                                                                   |
| ------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------- |
| Gate 9 — `pnpm db:migrate` `0011`, then a walk-through | product | No local Postgres in this session; not applied to the pilot database without sign-off |
| Constraint tests for `0011` in `packages/db/test`      | next    | Need a database to run against                                                        |
| Assistant tools for payables                           | later   | M25 tool list; any `Qty` must go as a string                                          |
