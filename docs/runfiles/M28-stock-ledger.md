# M28 · stock ledger

**Milestone:** M28 · **Phase:** 3 — Hardening
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §1, §5, §2 R6/R7/R16
**Deviation:** [ADR 0034](../decisions/0034-stock-ledger.md) — supersedes §1's
_inventory_ clause and amends [ADR 0026](../decisions/0026-demand-order-sheets.md).
Read both before this runfile. Recipe costing stays excluded.
**Preceding gate:** [M27](./M27-staff-advances.md) — PASS on 1–7; gate 8 carried
forward to product.
**Session note:** the third milestone in one session, on the product owner's
explicit instruction to continue building. §0 rule 1 was overridden, not
forgotten.

---

## 1. Purpose

Know how much of each catalogue item the restaurant holds: what came in, what
went to the kitchen, what was thrown away, and what a physical count found,
with the difference between the book and the shelf on record.

## 2. Scope

**In:**

- `packages/db/src/schema.ts` — `stock_movements`, `stock_movement_kind`
  (`RECEIVED`, `ISSUED`, `WASTED`, `COUNTED`), three `CHECK`s. Migration `0010`
  and its snapshot (R8). `demand_items` gains no column.
- `apps/pos/lib/stock/ledger.ts` — pure: the delta per kind, the refusal rules,
  `collectCounts`, the quantity display.
- `apps/pos/lib/stock/ledger.test.ts`.
- `apps/pos/lib/stock/queries.ts` — on-hand per item, one item's history.
- `apps/pos/lib/stock/actions.ts` — record one movement; save a count sheet.
  Both lock the items they touch, both audited (R2, R7).
- `/admin/stock` (on-hand and the movement form), `/admin/stock/count` (the
  count sheet), `/admin/stock/[itemId]` (one item's movements with a running
  balance). `StockBook.tsx`, `StockCountSheet.tsx`.
- `AdminShell` — **Stock** under Oversight, beside Demand sheets.

**Out, and why:** sales depletion and recipes (recipe costing, §1), stock
value and cost of goods (a costing method), par levels and alerts (a separate
decision once counts are trusted), receiving against a demand sheet (the
three-way match ADR 0026 refused), suppliers (§1). Edits and deletes: a wrong
movement is corrected by a count or a counter-movement.

## 3. Decisions

See ADR 0034. In short: a movement ledger over `demand_items`; on-hand is a
sum and never a column; a unit is required, and saved to the catalogue, on an
item's first movement; no issue or waste below zero; no money; a count is
dated today, comes only from the count sheet, and keeps its variance.

**Counts only through the sheet; the single form takes in, out and waste.** A
count typed into the one-line form would be the same row as one typed into the
sheet, with a second code path to keep in step.

## 4. Gate

| #   | Assertion                                                           | Method                                                                           | Result                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | On-hand is the exact sum of deltas, fractional quantities included  | `ledger.test.ts`                                                                 | **PASS**                                                                                                                                                                                                                                                |
| 2   | A count writes delta = counted − book, and keeps the counted figure | `ledger.test.ts`; the `CHECK`s hold the sign per kind in the database            | **PASS**                                                                                                                                                                                                                                                |
| 3   | Issue or waste below zero is refused; waste needs a reason          | `ledger.test.ts`; `FOR UPDATE` on the item rows in both actions                  | **PASS**                                                                                                                                                                                                                                                |
| 4   | A typed zero on the count sheet is a count; a blank box is not      | `ledger.test.ts` — `collectCounts`                                               | **PASS**                                                                                                                                                                                                                                                |
| 5   | Header counts derive from the list they head (R16)                  | Review: the stock page summary counts the rows it is given                       | **PASS**                                                                                                                                                                                                                                                |
| 6   | `demand_items` gains no stock column                                | Review of `0010`: only `stock_movements` is created                              | **PASS**                                                                                                                                                                                                                                                |
| 7   | Every mutation audited in its transaction (R7); `pnpm run ci` green | Review; CI                                                                       | **PASS** — 281 POS tests, 7 new; `migration-diff` sees `0010` once committed                                                                                                                                                                            |
| 8   | Opening count on the pilot database                                 | `pnpm db:migrate`, count the store, receive, issue, waste, recount, read history | **PARTIAL** — migrations `0008`–`0010` applied to the pilot database on 2026-09-25; the new constraints verified against it by `packages/db/test/constraints.test.ts` (rolled back, no data left). The walk-through on the screens remains with product |

## 5. Exit

A manager can record deliveries, issues to the kitchen and waste (with a
reason) against the demand catalogue, and save a count sheet laid out like the
paper. The stock page shows on-hand per item, derived from the ledger on every
read; each item's page shows every movement with the book after it, so a
count's variance is on record. Nothing goes below zero, a count is always
today's, and the first movement of an item fixes its unit. `demand_items`
gained no column.

### Carried forward

| Item                                          | Owner    | Why                                                                                  |
| --------------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| Gate 8 — an opening count through the screens | product  | Migration applied; needs a signed-in manager                                         |
| Units for the 144 items                       | product  | Asked for on first movement; the opening count is the natural moment to fill them in |
| No read of stock in the M25 assistant         | **done** | `stock_on_hand`, with `staff_advances` and `attendance_month` — ADR 0031 amendment   |
