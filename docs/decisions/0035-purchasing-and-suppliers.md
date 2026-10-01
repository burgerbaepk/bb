# 0035 — purchasing: suppliers, purchase orders, supplier bills and payables

**Status:** accepted
**Date:** 2026-10-01
**Milestone:** [M29](../runfiles/M29-purchasing.md)
**Amended by:** [ADR 0037](0037-manager-keeps-registers.md) — the register
is now `expenses.write` (owner and manager), not owner-only.
**Supersedes:** the **purchasing** and **supplier management** clauses of
BUILD-PLAN.md §1's _Do not build_ list. Amends [ADR 0034](0034-stock-ledger.md)
(a supplier bill now books stock in, and `stock_movement_kind` gains
`RETURNED`) and [ADR 0026](0026-demand-order-sheets.md)'s refusal of the
three-way match, to the extent set out below. **Recipe costing stays
excluded.** Migration `0011`. No frozen contract changes.

## Context

The product owner asked for the whole purchase module in the back office:
purchase orders, supplier invoices, supplier management, payments to
suppliers, a ledger per supplier, and reporting. Today the restaurant pays its
suppliers out of the till or by transfer, records some of it as expenses, and
keeps what it owes in a notebook. ADR 0026 and ADR 0034 both named this
request in advance and said it would need its own ADR. This is that ADR.

## Decision

**A supplier register, owner-only.** `suppliers`: name, contact, phone,
address, NTN, an opening balance, active. Writes need `staff.write`, which only
OWNER holds — the grant ADR 0032 used for the staff register, for the same
reason. The fraud against a payables book is the fictitious supplier: one hand
creates the payee, posts a bill against it and pays it. Keeping the register
with the owner, and bills and payments with the manager (`expenses.write`),
splits the duties that fraud needs. `reports.read` reads everything, so
AUDITOR can.

**A purchase order is a request, not a fact.** `purchase_orders` and
`purchase_order_lines`: a supplier, dates, catalogue items, quantities and an
optional agreed amount. It moves no stock and owes no money. `OPEN → CLOSED`
when a bill is posted against it (or by hand), `OPEN → CANCELLED`; nothing
moves out of either. Its number is an identity column: a PO number is a
reference for a phone call, not a fiscal sequence, and a gap after a rollback
is harmless.

**A supplier bill is the fact, and it is posted whole.** `supplier_bills` and
`supplier_bill_lines`. Posting one, in a single transaction:

- raises what is owed to the supplier by the bill's total;
- writes a `RECEIVED` stock movement per line, dated the bill date, with the
  bill number in the note — each line checked by the stock ledger's own
  `refuseMovement`, so a bill line obeys the same rules as a hand-entered
  receipt (a unit on first movement, no future date);
- closes the purchase order it was entered against.

There is no draft and no edit. A wrong bill is **cancelled** — a reason is
required, the bill stays listed, its total leaves the balance, and each line
goes back out of stock as `RETURNED`, dated today. A cancellation whose stock
has already been used is refused: the book would go negative, which ADR 0034
does not allow.

The bill's line items are the demand catalogue (`demand_items`), the same list
as the demand sheets and stock. A second list of the same goods would drift
from the first within a month — ADR 0034's argument, unchanged.

**Amounts as the paper states them.** A line is a quantity and the line amount
printed on the bill, not a unit rate: the rate is shown for a sense check but
the amount is what was agreed. Above the lines, `charges` (the supplier's own
sales tax, freight, loading) and `discount`. No tax column: input tax on a
supplier's bill is not this restaurant's output tax, and R9's gate rightly
allows a computed tax figure only on `invoices`.

**The total is stored.** `supplier_bills.total`, as `invoices.grand_total` is.
The bill is immutable once posted, so the stored figure cannot drift from its
lines.

**The same supplier invoice cannot be entered twice.** A partial unique index
on `(supplier, lower(supplier_ref))` for posted bills. The defect it prevents is
the bill paid twice; a cancelled entry frees the number for the correct one.

**Payments against the supplier, not against a bill.** `supplier_payments`:
amount, method, reference, date. A restaurant pays its vegetable supplier "Rs.
40,000 on account", not invoice by invoice, and an allocation table would be a
second ledger that has to agree with this one. The balance is derived:
`opening + Σ posted bills − Σ payments`. A payment may not exceed the balance —
ADR 0033's rule, for the same reason: with no edit and no delete, an
overpayment typed by mistake could only be undone by inventing a bill.

**Paid from the till means a `PAY_OUT` in the same transaction**, linked from
the payment — ADR 0033's mechanism, unchanged. Cash only, dated today, and an
open shift required. `settlement_method` is a new enum (cash, bank transfer,
cheque, wallet) rather than `payment_method`, which is the till's tender list
and a frozen contract.

**A supplier payment is not an expense.** The bill recorded what was bought.
Writing the payment to `expenses` as well would count the purchase twice. The
expense ledger keeps meaning "money spent that no bill records".

**R3.** The purchase order, the bill and the payment carry an idempotency key
minted by the server page, one per render. A bill double-posted on a slow
connection would be stock counted twice and a supplier paid twice.

## What this specifically does not build

- **Recipe costing, cost of goods, margin, stock value.** Still §1. The bill
  amounts make an average cost computable; nothing computes it.
- **Partial deliveries against one PO.** A bill closes its PO. What did not
  come is a new PO. Add receipt tracking per line when somebody needs it.
- **Allocation of payments to bills, ageing by bill, due-date reminders.** The
  bill carries a due date for the eye; nothing acts on it.
- **Purchase returns as a document, debit notes.** `RETURNED` exists for
  cancellation; a return document is its own request.
- **Supplier advances (paying before the bill).** Refused by the balance
  rule; enter the bill first.
- **An assistant tool.** A change to M25's tool list.

## Consequences

- One new navigation section, **Accounts**: Suppliers, Purchase orders,
  Purchases, and (ADR 0036) Credit customers.
- The stock book now shows `Received` rows noted `Bill #n — Supplier`, and
  `Returned to supplier` rows when a bill is cancelled.
- Migration `0011` adds `RETURNED` to `stock_movement_kind` and rewrites the
  stock `CHECK` in the same transaction. Postgres refuses a new enum value cast
  inside the transaction that added it, so the constraint compares `kind::text`.
- The till pay-out a supplier payment writes appears on the shift report with
  the supplier's name, so a short drawer explains itself.
