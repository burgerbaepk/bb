# 0026 — demand order sheets, and where they stop being purchasing

**Status:** accepted
**Date:** 2026-09-06
**Milestone:** M23
**Supersedes:** a clause of `docs/BUILD-PLAN.md` §1's _Do not build_ list. That
list names **purchasing** and **supplier management**; this ADR admits one
document that touches the edge of both and fixes the boundary. No data contract
changes (ADR 0008 holds — no `PermissionSchema` change, no view model change).
Two new tables, one new enum, migration `0004`.

## Context

The product owner asked for a demand order sheet: the list a restaurant manager
writes of what must be bought before the kitchen runs out, handed to whoever
does the buying.

The plan says, in §1:

> **Do not build:** inventory, recipe costing, purchasing, supplier management,
> payroll, loyalty, online payment gateway, delivery dispatch, aggregator
> integrations, multi-branch, multi-tenancy.

That list is not arbitrary. Every item on it is a product in its own right that
has sunk restaurant POS projects by arriving half-finished, and _purchasing_
is the worst of them: a purchasing module that cannot reconcile what was
ordered against what arrived against what was invoiced is not a partial
purchasing module, it is a source of numbers nobody can trust — the same class
of defect as the settings screen ADR 0025 removed, where a surface reported
work it had not done.

So the request cannot be refused on the plan's authority alone — the owner is
the one the plan serves — but neither can it be waved through, because "we have
demand sheets" is one feature request away from "so where is the goods-in
screen".

## Decision

Build the **document**, not the system.

A demand sheet is a dated, authored, frozen-on-submit list of items and
quantities. It is the paper form, in the database, with an audit trail. The
distinction that makes this safe is that a demand sheet only ever records
**what a person asked for**. It never records, computes, or implies a fact
about the world:

| A demand sheet records                 | It does not, and must not, record        |
| -------------------------------------- | ---------------------------------------- |
| The manager asked for 20 kg of chicken | How much chicken there is                |
| On 6 September, for Tuesday            | How much there will be on Tuesday        |
| Estimated at Rs. 620/kg                | What it actually cost                    |
| Sent to "Al-Karam Poultry"             | Who Al-Karam Poultry are, or their terms |
| Submitted by Ayesha at 14:02           | That anybody approved it                 |

Everything in the left column is a statement about a document. Everything in
the right column is a statement about the restaurant, and each one requires a
system to keep it true. That is the line, and it is the whole of this ADR.

## What this specifically does not build

**No stock levels.** Nothing in the schema knows an on-hand quantity. There is
no par level, no reorder point, no depletion. The manager knows what the
walk-in looks like; the sheet is where they write down the consequence.

**No receiving.** A submitted sheet has no "received" state, no partial
delivery, no variance. What arrives is money leaving, and money leaving is an
`expenses` row — a table that has existed since M02 and is already the ledger
the owner reads. Joining the two is the three-way match, which is purchasing.

**No supplier master.** `demand_sheets.supplier` is `text`. Making it a foreign
key to a `suppliers` table with contacts, payment terms and a ledger _is_
supplier management, and would arrive with the question of which supplier is
cheapest, which is procurement.

**No recipe link.** A demand line has no `menu_item_id`. Ten kilos of mince is
not four hundred burgers until somebody writes a recipe, and recipe costing is
on the list too.

**No approval.** DRAFT → SUBMITTED is the author saying "I am finished", not a
second person saying "yes". There is no approver, no rejection, no
counter-signature. Adding one means adding a permission and a role scope, and
it should be added the day somebody is actually asked to sign, not before.

Each of those is one obvious step from what shipped, which is precisely why
each is written down here. The next person to be asked for "just the received
checkbox" should read this paragraph before agreeing: the checkbox is not the
feature, the reconciliation behind it is.

## Consequences

- Two tables — `demand_sheets`, `demand_sheet_lines` — and
  `demand_sheet_status` (`DRAFT`, `SUBMITTED`, `CANCELLED`). Both soft-deleted
  (R6), both audited (R7).
- **No permission was added.** `reports.read` gates the screen and
  `expenses.write` gates every mutation, which is the split `/admin/expenses`
  already uses. OWNER and MANAGER can write; AUDITOR can read; CASHIER and
  WAITER see nothing. The frozen `PermissionSchema` is untouched and
  `seeds/roles.ts` needs no reconcile.
- **R9 is untouched and this is worth stating plainly.** The estimated unit
  cost on a demand line is money the restaurant expects to spend. It is not a
  taxable amount, it does not reach `@natech/fiscal`, and no tax column exists
  outside `invoices` and `invoice_tax_lines`. A demand sheet is not a document
  the authority has any interest in.
- The quantity column is `numeric(10,3)` and is read through the existing
  `Qty` helpers, so `0.25` kg behaves the same way `0.25` kg behaves on an
  order line. `extend()` carries the estimate in exact paisa (R1).

## Amendment, M24 — the catalogue

**Date:** 2026-09-06. Two tables became three; the boundary above is unchanged.

After this ADR was accepted the product owner supplied the restaurant's actual
demand sheet, `Restaurant_Demand_Sheet_Editable.xlsx`. It is not a blank form.
It is a printed checklist of 144 items in four columns — Items, Kitchen,
Bakery, Drinks — with an empty quantity box beside each one. The manager walks
the store and writes numbers next to what needs buying.

That makes M23's type-each-line screen the wrong interaction, and for a reason
worth stating: the printed list is not only faster than typing, it is _the
reminder_. A blank form cannot stop the manager forgetting the phenyl. So
`demand_items` was added — the list, seeded from that workbook.

**Why a catalogue does not cross the line this ADR draws.** The rule above is
that the module records what a person asked for, never a fact about the
restaurant. A list of item names is neither. It is the form itself — the thing
already printed on the paper before anybody wrote on it. Read against the
table in the Decision section, a catalogue row populates no cell in either
column: it does not say how much chicken there is, what it cost, or who sells
it.

The boundary is now narrower and easier to police than it was in prose:
**`demand_items` may carry a name, a category and a default unit, and nothing
else.** A `current_stock` column makes it inventory. A `preferred_supplier`
column makes it supplier management. A `last_price_paid` column makes it
procurement. Each is one migration away, each would look reasonable in
isolation, and each requires a new ADR rather than a column.

Two consequences worth recording:

- **`demand_sheet_lines.unit` became nullable.** M23 required it; the paper has
  no unit column, because everyone in the kitchen knows chicken is kilos. The
  change cost one migration on a table with zero rows. It would have cost a
  migration plus a backfill of invented units after the pilot.
- **No unit was seeded for any of the 144 items.** Guessing would have put 144
  fabricated values on a live screen, which is the defect ADR 0025 exists to
  prevent. `default_unit` is null until somebody who knows fills it in.

The catalogue is client data and lives in `packages/db/seeds/demand-items.ts`,
per deployment, like the menu under ADR 0012 — not in `apps/`, which is what
R12's brand-grep guards.

## Carried forward

- If a demand sheet ever needs to be cited by number, §5.8's `counter()` is the
  mechanism, as it is for the invoice number. It was not added because nothing
  currently cites one.
- The temptation this ADR exists to resist will arrive as a small request. The
  answer is not "no"; the answer is that receiving, stock and supplier terms
  are a purchasing milestone with its own plan section, and the demand sheet is
  the document that feeds it — not a place to hang it one column at a time.
