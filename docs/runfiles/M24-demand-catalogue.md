# M24 · demand sheet catalogue and grid entry

**Milestone:** M24 · **Phase:** 3 — Hardening
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §5, §14.1, §19, §2 R1/R6/R7/R11/R12
**Deviation:** [ADR 0026](../decisions/0026-demand-order-sheets.md), amended by this
milestone. The boundary is unchanged; the catalogue sits inside it, and the
amendment section says why.
**Preceding gate:** [M23](./M23-demand-sheets.md) — PASS, migration `0004`
applied.

> §0 rule 1 is "one milestone per session, never combine". M23 and M24 were
> built in the same session, sequentially, each with its own runfile and gate,
> because the product owner supplied the restaurant's real demand sheet after
> M23 had shipped and the correction was materially cheaper before the table
> carried rows. They are recorded separately rather than merged.

---

## 1. Purpose

M23 shipped a blank form: the manager types an item name, a unit and a
quantity, one line at a time. The product owner then supplied
`Restaurant_Demand_Sheet_Editable.xlsx` — the form the restaurant actually
uses — and it is not a blank form.

It is a **standing checklist**. Four printed columns (Items, Kitchen, Bakery,
Drinks), 143 distinct items, and an empty `Qty` box beside each one. The manager
walks the store and writes a number next to what needs buying. Every quantity
cell in the supplied file is empty; that is the design, not an omission.

Two things follow, and the second is the one that matters:

**Typing is the wrong interaction.** Thirty items typed from memory against
thirty numbers entered beside a printed list is not a small difference in
speed.

**The list is the reminder.** Half the value of the paper is that it stops the
manager forgetting the phenyl. A blank form cannot do that at all, however fast
it is to type into. This is the part M23 missed entirely.

---

## 2. Scope

**In:**

- `packages/db/src/schema.ts` — `demand_items`. Two changes to
  `demand_sheet_lines`: `unit` becomes nullable, and a snapshot `category` is
  added. Migration `0005`.
- `packages/db/seeds/demand-items.ts` — the 143 items, transcribed from the
  supplied workbook in printed order.
- `packages/db/seeds/index.ts` — `seedDemandItems`, reconciled like the menu.
- `apps/pos/lib/demand/queries.ts` — `readDemandCatalogue()`, grouped by
  category in printed order.
- `apps/pos/lib/demand/actions.ts` — `addDemandLinesAction`, one submit for the
  whole grid. `unit` no longer required.
- `apps/pos/components/admin/DemandSheetGrid.tsx` — the checklist itself.
- `apps/pos/components/admin/DemandSheetEditor.tsx` — the grid above the
  existing single-line form, which stays for anything off-list.
- `apps/pos/lib/demand/grid.test.ts` — the parse-and-filter logic.

**Out, and why:**

- **Seeded units.** The paper has no unit column. Guessing `kg` for 143 items
  would put 143 fabricated values on a live screen — the defect class ADR 0025
  removed from the settings page. `default_unit` exists and is null until
  somebody who knows fills it in.
- **A catalogue editor screen.** The list is seed data, edited like the menu.
  A CRUD screen for it is a milestone with its own gate, and nobody has asked
  to edit the list yet.
- **The two divider cells** ("Miscellaneous" in Items, "Misc" in Drinks) as
  items. They are visual rules on the paper, not things to buy. Their position
  survives in `sort_order`.
- **Everything ADR 0026 already excludes.** A catalogue is a list of names. It
  gains no stock level, no cost, no supplier, and no recipe link.

---

## 3. Decisions

**A catalogue is not the inventory ADR 0026 refuses, and the distinction is
exact.** That ADR's rule is that this module records what a person asked for,
never a fact about the restaurant. A list of item _names_ is neither — it is
the printed form itself, the thing that was already on the paper before anyone
wrote on it. It says these are the things we might buy; it says nothing about
how much there is, what it costs, or who sells it. The boundary to hold is
name, category and default unit, and nothing else: the day the table grows a
`current_stock` or a `preferred_supplier`, it has crossed.

**The catalogue is seed data, and it is client data.** "Turbo", "Mighty" and
"Zinger" are this restaurant's product names. They belong in
`packages/db/seeds/`, per deployment, exactly as ADR 0012 treats the menu —
never in `apps/`, which is what R12's brand-grep guards. Another client gets a
different seed file and the same code.

**`unit` becomes nullable rather than defaulted.** M23 made it `NOT NULL`,
which the paper form does not do and the kitchen does not need. Changing it now
costs one migration on a table with zero rows; changing it after the pilot
costs a migration plus a backfill of invented units. A line may carry a unit
when it helps and omit it when it does not, which is what the paper does.

**Category is snapshotted onto the line, not joined.** The same reasoning as
`order_lines.name_snapshot`: a submitted sheet is a frozen document, and
recategorising an item next month must not silently rewrite what a manager
handed over in September. It also means an off-list line simply has no
category, with no join to make nullable.

**Only rows with a quantity become lines.** The grid posts 143 boxes and the
action keeps the ones that were filled in. A submitted sheet lists what was
asked for, not 143 rows of zero — an empty box means "not this week", which is
different from asking for none.

---

## 4. Gate

| #   | Assertion                                                          | Method                                                                                                                                                                       | Result   |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | The catalogue matches the supplied workbook exactly                | Seed generated from the xlsx, not retyped. 146 cells → 143 items: two dividers excluded, and "Black pepper" is printed twice in the Bakery column (F13, F38) and seeded once | **PASS** |
| 2   | Only filled boxes become lines; blanks and zero are ignored        | `grid.test.ts` — `collectGridLines()` over a mixed submission                                                                                                                | **PASS** |
| 3   | A bad quantity in one box fails that box, not the whole submission | `grid.test.ts` — the invalid entry is reported by item name and no line is written                                                                                           | **PASS** |
| 4   | No fabricated unit reaches the database                            | `default_unit` is null for all 143 seeded items; the seed states why                                                                                                         | **PASS** |
| 5   | No client stock list in `apps/` (R12)                              | `brand-grep` passes; the catalogue is in `packages/db/seeds/`                                                                                                                | **PASS** |
| 6   | A submitted sheet still refuses grid entry                         | `addDemandLinesAction` routes through `loadDraftSheet()`, the same single gate M23 built                                                                                     | **PASS** |
| 7   | Every grid submission writes one audit row per line (R7)           | `writeAudit` per inserted line inside the one transaction                                                                                                                    | **PASS** |
| 8   | `pnpm run ci` green; both apps build                               | typecheck, lint, tests, four gates                                                                                                                                           | **PASS** |

---

## 5. Exit

The demand screen is now the paper form. A manager opens a draft sheet, sees
the four printed columns with 143 items in the order they are used to, types
numbers beside the ones that need buying, and submits once. Anything not on the
list still goes in through M23's single-line form, which is what the blank rows
on the paper are for.

The freeze, the audit trail, the state machine and the estimate arithmetic are
all M23's and are unchanged — the grid is another way to write lines onto a
draft sheet, not a second lifecycle.

### A duplicate on the supplied form

"Black pepper" appears twice in the Bakery column, at F13 and F38. It is seeded
once: it is one thing to buy, and a second identical box would let a manager
enter two quantities for it and order it twice. Worth mentioning to the
restaurant, since the same duplication is presumably on the printed pads they
are using now.

### Carried forward

- **`default_unit` is null for all 143 items.** Filling it in is a data task
  for somebody in the kitchen, not a guess for whoever ships this. Once it is
  populated, the grid can show the unit beside each box and stop asking.
- **The catalogue has no editor.** Adding an item today means editing the seed
  and re-running `pnpm db:seed`. That is the same deal the menu had until M08,
  and it is fine until somebody needs to add an item at 22:00.
- **The two column groupings are the client's, not a taxonomy.** "Items" holds
  both frozen patties and pizza boxes because that is how their sheet is laid
  out. Do not rationalise it without asking them.
