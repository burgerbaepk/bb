# 0036 — credit sales at the till, and customer accounts

**Status:** accepted
**Date:** 2026-10-01
**Milestone:** [M30](../runfiles/M30-customer-accounts.md)
**Touches:** §6 (finalize), R5, R9, [ADR 0016](0016-customer-phone-capture.md)
(the `customers` table). Two new tables, one new enum, migration `0011`
(shared with ADR 0035). **No frozen contract changes** — `PaymentMethod`,
`Invoice` and the report view models are untouched (ADR 0008).

## Context

The product owner asked for credit invoices from the till. Some customers —
an office that orders lunch daily, a regular — are served now and pay at the
end of the week or month. The default stays as it is: an order with no
customer is a Walk-in Customer, pays in full, and gets no account. The
restaurant needs to record what each credit customer owes, record their
payments when they come, and know the balance.

## Decision

**An account is a deliberate thing the owner opens.** `customer_accounts`, one
per `customers` row the owner has agreed to give credit, with a credit limit
(null for none), an opening balance, a note, and active. Opening, changing
and closing an account is `staff.write`, owner-only. A cashier who could open
an account could invent a customer and sell to them on credit. The till's
walk-in capture (ADR 0016) writes `customers` and never this table, so no
walk-in becomes an account by accident.

The account hangs off `customers` rather than being a second list of people:
the person is found or created by their canonical mobile number, the key the
till already uses, so the customer the cashier knows by phone and the
customer with the account are one row.

**A credit sale is an ordinary invoice.** The cashier presses **Credit** beside
Finalize, picks the account, and optionally enters cash paid now. In the one
finalize transaction:

- the invoice is computed, numbered and written exactly as any other (R5, R9);
- the cash paid now, if any, is a normal `CASH` payment row, so it is in the
  drawer's expected cash with no change to M12;
- the rest is a `CHARGE` row on `customer_account_entries`, pointing at the
  invoice — one per invoice at most, by a partial unique index;
- the order's customer becomes the account holder, so the invoice prints their
  name.

**Tax is settled at finalize, at the cash rate.** R9 needs the rate when the
invoice is written, and the part on account has no tender yet. The reduced
card rate is for a sale paid by card, which this is not, so the invoice is
taxed exactly as a cash sale. A later payment by card does not change the
invoice: it settles a debt, it is not a sale. To keep that true, the part paid
at the counter on a credit sale must be cash; finalize refuses anything else.

**Limit and balance are checked under lock.** Finalize locks the account row
`FOR UPDATE`, derives the balance, and refuses a sale that would take
`balance + on-account` over the limit. Two credit sales rung up at once on two
terminals cannot both read the old balance.

**The balance is derived, never stored:** `opening + Σ charges − Σ payments`,
counting only charges whose invoice is still `FINALIZED`. A credit note turns
an invoice `CREDITED`, and its charge drops out of the balance on read. The
credit-note path needs no knowledge of accounts, and there is no second write
to forget.

**Payments received** are `PAYMENT` rows: amount, method, reference, date.
`payment.take` records one, the grant for taking money. Cash into the drawer
writes a `PAY_IN` on the open shift in the same transaction (ADR 0033's
mechanism). A payment may not exceed the balance, for ADR 0033's reason.

**The receipt says it.** A credit invoice prints "Paid now", "On account —
<name>" and a signature line. The amount is derived from the invoice already
in hand (total less approved payments), so the frozen `Invoice` contract
needs no new field.

**Offline, there is no credit.** The button is disabled and the handler
refuses: the balance and limit live on the server, and an offline credit sale
could not be checked against either.

## What this specifically does not build

- **Allocation of payments to invoices, ageing buckets, interest, reminders.**
  The statement shows every sale and payment with a running balance.
- **Credit sales paid partly by card.** The rate rule above. Add it with its
  own tax decision if card terminals arrive.
- **Taking an account payment on the till screen.** It is recorded in the back
  office (a manager or owner); cash taken at the counter for an account goes
  in with "Paid into the till".
- **Credit on web orders.** The storefront has no account concept.
- **An assistant tool.** A change to M25's tool list.

## Consequences

- The sales report's payment mix shows only money actually taken; the credit
  part of a credit sale is in sales totals and on the account, not in any
  tender. The Credit customers page shows credit sold this month.
- The exceptions report is unchanged: a credit sale is finalized, so it is
  never `BILL_NOT_FINALIZED`.
- `finalizeOrderAction` takes an optional `account`, and accepts no payment
  slices only when one is given. Every other sale behaves exactly as before:
  paid in full or refused.
