# 0034 — a manual stock ledger, and where it stops short of recipe costing

**Status:** accepted
**Date:** 2026-09-25
**Milestone:** [M28](../runfiles/M28-stock-ledger.md)
**Supersedes:** the **inventory** clause of BUILD-PLAN.md §1's _Do not build_
list, and amends [ADR 0026](0026-demand-order-sheets.md)'s rule that nothing
in the schema knows an on-hand quantity. **Recipe costing stays excluded.**
One new table, one new enum. No frozen contract changes.

## Context

The product owner asked for stock management. ADR 0026 anticipated the request
and set the condition for it: stock is its own milestone with its own ADR, and
not a column added to `demand_items` one request at a time. This is that ADR.

Decided with the product owner on 2026-09-25: a manual ledger (stock in, stock
out, physical count). Not automatic depletion from sales, and not a bare daily
count sheet.

## Decision

**A movement ledger, and on-hand is a sum.** One table, `stock_movements`:

- `item_id` → `demand_items`. The demand catalogue becomes the restaurant's
  single item list. A second list of the same 144 things would drift from the
  first within a month.
- `kind` — `RECEIVED` (in), `ISSUED` (out to the kitchen), `WASTED` (out, with
  a required reason), `COUNTED` (a physical count). `CHECK` constraints hold
  the sign of `delta` to the kind and the reason to a waste.
- `qty` — `numeric(10,3)` read through `Qty`, like every other quantity.
- `delta` — the signed change the row makes. For `COUNTED` the action computes
  it as counted − derived on-hand, inside the transaction, and keeps the counted
  figure in `qty`. The variance is therefore on record, not overwritten.
- `occurred_on`, `note`, `recorded_by`.

On-hand is `Σ delta` per item, never a stored column. ADR 0026's line moves
exactly this far: `demand_items` still carries a name, a category and a unit,
and nothing else. The quantity lives in a ledger that can be audited row by
row, not in a cell that is overwritten.

**A unit becomes required, per item, on first movement.** ADR 0026 left
`default_unit` null for all 144 items rather than invent them. Stock cannot do
that: "12" chickens and "12" kilos are different stock. The first movement for
an item with no unit asks for one and saves it to the catalogue. Nothing is
seeded.

**No issue or waste below zero.** A negative on-hand is a number nobody can
use. If the book says 4 kg and the kitchen took 5, one of the two is wrong, and
the fix is a count, not a negative. The check runs after a `SELECT … FOR
UPDATE` on the item row.

**No money.** A movement has no cost. Valuing stock needs a costing method
(FIFO, average), which is where recipe costing and purchasing begin.

**No link to a demand sheet or an expense.** A `RECEIVED` row says 20 kg came
in. It does not say which sheet asked for it or which expense paid for it,
because joining those three is the three-way match ADR 0026 refused, and that
refusal stands.

**`expenses.write` for writes, `reports.read` to read**, as M23.

## What this specifically does not build

- **Depletion from sales.** Needs a recipe per menu item: recipe costing, still
  excluded by §1.
- **Stock value, cost of goods, margin.** Needs a costing method.
- **Par levels, reorder points, low-stock alerts.** Each is a column on the
  item and a rule. Add them as their own decision once the counts are trusted.
- **Receiving against a demand sheet.** The three-way match.
- **Supplier records.** Supplier management, still excluded.

## Consequences

- The count screen is laid out like the demand grid — the four printed
  columns, a box beside each name — so the manager walks the store with the
  same paper. It does **not** reuse `collectGridLines`: that function treats a
  typed zero as blank, which is right for a demand sheet ("not this week") and
  wrong for a count, where 0 means the shelf is empty. `collectCounts` keeps
  the difference.
- **A count is dated today and comes only from the count sheet.** A count says
  what is on the shelf now; back-dating one would compute its variance against
  a book that already includes later movements.
- A count that differs from the book shows its variance per item. Consistent
  shrinkage on one item is the thing this module exists to show.
