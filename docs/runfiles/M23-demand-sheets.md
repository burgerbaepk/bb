# M23 · demand order sheets

**Milestone:** M23 · **Phase:** 3 — Hardening
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §5, §14.1, §19, §2 R1/R4/R6/R7/R11
**Deviation:** [ADR 0026](../decisions/0026-demand-order-sheets.md) — the plan's
"do not build" list names _purchasing_ and _supplier management_. Read the ADR
before this runfile; it draws the line this milestone stays inside.
**Preceding gate:** [M22](./M22-storefront-layout.md) — PASS.

---

## 1. Purpose

The manager needs to write down what the kitchen must buy before it runs out,
and hand that list to whoever does the buying. Today that happens on paper or
in a WhatsApp message, which means nobody can answer "what did we ask for last
Tuesday, and who approved it" a month later.

A demand order sheet is a **document**, not an inventory system: a dated list
of items and quantities, authored by a manager, frozen once submitted, and
retained in the audit trail like every other mutation in this product (R7).

It is deliberately the smallest thing that replaces the paper. What it is not
is set out in §2 and argued in ADR 0026 §3.

---

## 2. Scope

**In:**

- `packages/db/src/schema.ts` — `demand_sheets`, `demand_sheet_lines`, and the
  `demand_sheet_status` enum. Migration `0004` and its meta snapshot (R8).
- `packages/domain/src/state-machines/demand-sheet.ts` — `demandSheetMachine`,
  the DRAFT/SUBMITTED/CANCELLED edges (R4).
- `apps/pos/lib/demand/queries.ts` — list and detail reads through `dbRead`.
- `apps/pos/lib/demand/total.ts` — `sheetEstimate()` and `unpricedLines()`. Split
  out of `queries.ts` because that module is `server-only` and this is pure, the
  same shape `lib/floor/bounds.ts` and `lib/dashboard/trend.ts` already use.
- `apps/pos/lib/demand/actions.ts` — create, add line, delete line, submit,
  cancel, delete sheet. Every write through `dbWrite` in a transaction, every
  one audited (R2, R7).
- `apps/pos/components/admin/DemandSheetList.tsx` — the create form and the
  ninety-day index.
- `apps/pos/components/admin/DemandSheetEditor.tsx` — one sheet: its lines, the
  add-line form while DRAFT, the submit and cancel controls.
- `apps/pos/app/admin/demand/page.tsx`, `apps/pos/app/admin/demand/[id]/page.tsx`.
- `apps/pos/components/admin/AdminShell.tsx` — one nav entry under Oversight.
- `apps/pos/lib/demand/total.test.ts` — the estimate arithmetic. The lifecycle
  is tested in `packages/domain/test/state-machines.test.ts`, beside the order,
  table and till machines, where the package's 100% coverage floor covers it.

**Out, and why:**

- **Stock levels, on-hand quantities, par levels, reorder points.** That is
  inventory, which the plan excludes outright. Nothing here knows how much of
  anything the restaurant has; the manager does, and writes down what to buy.
- **Receiving, goods-in, partial delivery, three-way match.** A submitted sheet
  is a request. What arrives is an expense, and the expense ledger already
  records it. Reconciling the two is the purchasing module the plan refuses.
- **A supplier master.** `supplier` is free text on the sheet. A table of
  suppliers with terms and contacts is supplier management by name.
- **Recipe costing and consumption.** No link between a demand line and a menu
  item. A demand line is "20 kg chicken"; the menu sells burgers.
- **Approval workflow.** DRAFT → SUBMITTED is authorship, not approval. There
  is no approver role, no rejection, no counter-signature. Added when somebody
  is actually asked to approve one.
- **Printing through the ESC/POS bridge.** A demand sheet is an A4 document for
  a supplier, not an 80mm receipt for a guest. The browser prints the page.
- **A new permission.** See §3.
- **Any tax treatment whatsoever.** R9 holds absolutely: the estimate on a
  demand sheet is an estimate of what the restaurant will spend, it is not a
  taxable amount, and no tax column exists outside `invoices` and
  `invoice_tax_lines`.

---

## 3. Decisions

**No new permission; `reports.read` to see, `expenses.write` to write.**
`PermissionSchema` is a frozen contract (ADR 0008) and every role's grant lives
in `packages/db/seeds/roles.ts`. Adding `demand.write` would have meant
touching both, plus a roles reconcile, to reproduce a grant that already exists
on exactly the right people: OWNER holds `*`, MANAGER holds `expenses.write`,
AUDITOR holds `reports.read` and so can read a sheet without writing one, and
CASHIER and WAITER hold neither. The `/admin/expenses` screen already splits
its page gate from its write gate this way, and this screen is its sibling —
both are manager-authored operating documents. If demand sheets ever need to
be delegated to somebody who may not record an expense, that is the milestone
that adds the permission, and it is a two-line change.

**Quantity is `Qty`, not a number.** `parseQty`, `qtyToString` and `extend`
already exist for `order_lines.qty` and solve this exactly: an integer count of
thousandths, `numeric(10,3)` in the column, no float anywhere. `20.5` kg of
chicken and `0.25` kg of saffron are the ordinary case on this document, and a
`double precision` column would have drifted them. Reusing `extend()` is also
what keeps R1 intact through the estimate: `extend(unitCost, qty)` returns
`Paisa`, rounded half away from zero once per line rather than accumulated.

**The estimated unit cost is optional, and it is an estimate.** A sheet with no
costs is a valid requisition and the common case for a manager who does not
know today's chicken price. A sheet with them answers "what will this cost us",
which is the question an owner asks before saying yes. It is nullable per line;
the sheet total sums only the lines that carry one and the UI says so, rather
than silently treating an unpriced line as free — the R16 principle that a
summary must be a function of the rows it claims to summarise.

**SUBMITTED is frozen, and the machine says so rather than an if-statement.**
`demandSheetMachine` is three edges (R4). The freeze is enforced in one place —
`loadDraftSheet()` in `actions.ts` — through which every line mutation and
every status change passes. A guard per action would have been six guards, and
the seventh action added later would have been the one that forgot.

**Cancelled, not deleted.** A submitted sheet that turns out to be wrong is
cancelled and a fresh one written, the same "no edit, only a fresh document"
shape R5 gives the invoice and `shiftMachine` gives the till. A DRAFT sheet
nobody submitted is soft-deleted, because an abandoned draft is not a record of
anything.

---

## 4. Gate

| #   | Assertion                                                          | Method                                                                                                                                                                                                                                                 | Result   |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| 1   | Quantity survives a fractional round-trip with no drift            | `lib/demand/total.test.ts` — `parseQty`/`qtyToString` over `0.100`, `1.005`, `9999.999`; a fourth decimal throws rather than rounding                                                                                                                  | **PASS** |
| 2   | The sheet estimate is exact paisa and ignores unpriced lines       | `lib/demand/total.test.ts` — `sheetEstimate()` over mixed priced/unpriced lines; `unpricedLines()` reports the shortfall the screen prints                                                                                                             | **PASS** |
| 3   | A SUBMITTED sheet refuses every line mutation                      | `loadDraftSheet()` is the single gate every line mutation passes; the illegal edges are asserted beside the other three machines in `packages/domain/test/state-machines.test.ts`                                                                      | **PASS** |
| 4   | Every mutation writes an audit row inside its own transaction (R7) | Six exported actions over five write paths — submit and cancel share `transitionSheet` — and five `writeAudit` calls, each inside its own `dbWrite().transaction`. `dbRead` appears in the file only in the comment explaining why it is not used (R2) | **PASS** |
| 5   | No money is formatted outside `Money` (R1)                         | Grep: the components render `<Money>`; `toString()` appears only in audit payloads                                                                                                                                                                     | **PASS** |
| 6   | No tax column, no tax arithmetic (R9)                              | `tax-column-grep` passes; the estimate never reaches `@natech/fiscal`                                                                                                                                                                                  | **PASS** |
| 7   | No restaurant identity, no mock data (R12, ADR 0025)               | `brand-grep` and `mock-data-grep` pass                                                                                                                                                                                                                 | **PASS** |
| 8   | `pnpm run ci` green                                                | 12/12 turbo tasks: typecheck, lint, 243 domain + 202 POS tests; `brand-grep`, `mock-data-grep`, `tax-column-grep` pass. `migration-diff` skips — the working tree is not a git checkout, which is an environment condition and not a result            | **PASS** |

---

## 5. Exit

A manager can write a dated demand sheet, add lines to it with fractional
quantities and optional estimated costs, submit it — after which it is frozen —
or cancel it, and read back ninety days of them. An auditor can read every one
and change none. Every one of those transitions is an audit row.

The module is one route pair, two components, two files of server code and
about ten lines of domain. It reuses `Qty`, `extend`, `sum`, `defineMachine`,
`writeAudit`, `DataTable` and the existing permission pair; the only genuinely
new things in the repository are two tables and three enum values.

### Carried forward

- **No sheet reference number.** A sheet is identified by its date, supplier
  and id. If sheets start being cited on paper or over the phone, they need a
  short human number, and §5.8's `counter()` column is how this repository does
  that — the same mechanism as the invoice number.
- **The estimate is never reconciled against what was actually spent.** The
  link between a submitted sheet and the expense rows that settle it is exactly
  the three-way match ADR 0026 declines to build. If it is ever wanted, the
  honest smallest version is a nullable `demand_sheet_id` on `expenses`, not a
  receiving module.
- **`supplier` is free text and will accumulate spelling variants.** That is
  the accepted cost of not building a supplier master. A `distinct` datalist on
  the input would soften it cheaply if it becomes annoying.
