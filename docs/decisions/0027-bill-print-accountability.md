# 0027 — a printed bill is an accountable event

**Status:** accepted
**Date:** 2026-09-06
**Milestone:** post-M23
**Supersedes:** the "no replacement" consequence recorded in
[ADR 0019](0019-remove-check-printed.md) for §6.13's abandoned-check compliance
signal. Widens `ExceptionKindSchema` by one member, which breaches the Phase-1
contract freeze ([ADR 0008](0008-freeze-data-contracts.md)) through §0 rule 7's
own escape hatch — a decision record rather than a silent edit, the same
posture as ADR 0015, ADR 0018 and ADR 0019. No schema change and no migration:
the record it relies on is `audit_log`, which R7 has been filling since M02.

## Context

The product owner described the attack in one sentence:

> The manager can take advantage of view bill option. Maybe he didn't complete
> or finalize the sale and print the view bill, give it the customer, take the
> payment and put it in own pocket.

This is correct, and it was possible. It is the oldest fraud in restaurant cash
handling — serve the table, hand over something that looks like a total, take
the cash, and never ring the sale through — and this codebase had removed its
own defence against it by accident.

§6.13 used to carry an abandoned-check signal: a check printed, open past a
threshold, with no invoice behind it, surfaced on the floor plan, the
compliance dashboard and the exceptions report. ADR 0019 deleted the printed
check outright and recorded, honestly, that the signal had "no replacement" and
that the closest analogue was "materially weaker" and had not been built.

What ADR 0019 did not account for is that the _document_ survived. `View bill`
and its `Print bill` button are still on the terminal, and they still produce a
piece of paper with a total on it that a customer will accept as a demand for
payment. So the artefact that makes the fraud possible remained, and the only
control over it was removed. Worse, both were pure client-side operations:

- `onViewBill` set a `useState` flag and opened a dialog.
- `Print bill` set another flag and called `window.print()`.

Neither touched the server. Neither required the order to exist. An operator
could build a cart, open the bill, print it, hand it over, take the money and
close the browser tab, and there would be no order row, no audit row, no
invoice — nothing anywhere in the database that had ever heard of the sale.
The exceptions report cannot report a sale that left no trace, and the Z report
reconciles cash against invoices, so the missing money would show as a drawer
variance with no explanation and no name attached.

## Decision

Three changes, none of which block the operator from doing their job.

**1. A bill cannot be produced for an order that does not exist.** Opening the
bill preview books the order first, through the `sendUnsentLines` path "Take
Order" already used. If booking is refused, the dialog does not open. The sale
is now visible in Active Orders and the Booked Orders queue from the moment a
customer is told what they owe.

**2. Showing and printing a bill are recorded.** A new
`recordBillPrintAction` writes an `audit_log` row against the order —
`ORDER_BILL_VIEWED` when the dialog opens, `ORDER_BILL_PRINTED` when paper
comes out — carrying the actor (R7), the order, and the `grandTotal` the
customer was quoted. It is not a mutation of `orders`: nothing about the order
changes by being read aloud, and R5/R9 leave no column this belongs in. The
event is the record.

**3. An abandoned bill is an exception.** `ExceptionKindSchema` gains
`BILL_NOT_FINALIZED`, produced by `readBillNotFinalizedExceptions` for any
order that got one of those audit rows, has no invoice, and was not voided.
The amount reported is the figure off the audit row — what the customer was
actually quoted — not a recomputation, because a menu edit since then must not
move it (§5.6). A printed bill outranks a shown one for the same order, so an
order is reported once and the summary total is not double-counted.

Alongside these, `/admin/activity` reads `audit_log` for the first time. R7 has
written a row for every mutation since M02 and PSTSA s.32(2) is why, but until
now there was no way for the person who needs it daily — the owner watching the
manager who watches the till — to read it. Rows that exist and cannot be read
are, operationally, rows that do not exist.

## Alternatives rejected

**Remove `View bill` entirely.** It would close the hole completely, and it is
wrong. Customers ask what they owe before they pay, and a POS that cannot
answer that question pushes staff to a calculator and a scrap of paper, which
is the same fraud with worse handwriting.

**Require a supervisor PIN to print a bill.** The step-up machinery exists
(`PinConfirmDialog`). Rejected because the threat model is a _manager_ — the
person who would hold the supervisor PIN. Authorisation cannot defend against
the authoriser; only a record they know is read can.

**Put the bill count on `orders` as a column.** Rejected under R9's posture: a
counter answers "how many" and loses who, when, and for how much, which is all
of the useful information. `audit_log` already stores exactly this shape.

**Auto-void or auto-finalize a stale quoted order.** Rejected outright.
Inventing an invoice nobody took payment for is a fiscal document for a sale
that did not happen, and auto-voiding destroys the evidence of the very thing
being watched for.

## Consequences

- The fraud is not prevented, and cannot be by software alone. It is made
  **attributable**: an operator who wants to quote a customer a total now
  necessarily leaves a row with their name, the amount and the time on it, and
  the order appears on the next morning's exceptions report until it is either
  finalized or explicitly voided with a reason. The control is that staff know
  the report is read.
- `View bill` now has a server round-trip and can fail. On a refused booking
  the dialog does not open and the operator sees why. This is intended: no
  order, no bill.
- Orders will accumulate in the booked queue that would previously have been
  abandoned invisibly. That is the signal working, not a regression.
- `BILL_NOT_FINALIZED` counts an order still legitimately open — a table
  mid-service that asked for its total early — until it is finalized. Same-day
  noise is expected; the report is intended to be read against a closed
  business date.
- No migration. `audit_log` already has `entity`, `entity_id`, `action`,
  `after` and the actor, and `audit_log_entity_idx` already covers the query.
