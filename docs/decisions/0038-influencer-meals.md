# 0038 — influencer meals: closed without an invoice, booked as an expense

**Status:** accepted
**Date:** 2026-10-02
**Milestone:** [M32](../runfiles/M32-expenses-and-influencer-meals.md)
**Touches:** §6 (finalize), R5, R7, R9, [ADR 0027](0027-bill-print-accountability.md),
[ADR 0029](0029-no-idle-lock-and-daily-owner-emails.md). One new column,
`expenses.order_id`, migration `0012`. **No frozen contract changes** —
`OrderStatus` is untouched (ADR 0008).

## Context

The restaurant gives meals to influencers for marketing. Nobody pays. The
product owner wants each one recorded, kept out of sales, and booked
automatically as an expense under "Influencers", started from the till where
"Walk-in Customer" is shown.

## Decision

**An influencer meal is a voided order with an expense attached.** From the
till's Customer dialog, "Influencer", a name, and "Record influencer meal ·
Rs. n". `recordInfluencerMealAction`, in one transaction:

- locks the order and closes it `VOIDED`, every line voided with reason
  `Influencer meal` — the signal the sales report already excludes;
- writes **no invoice**, so nothing reaches PRA or FBR and nothing is a sale;
- writes an `expenses` row: category "Influencers" (through the same
  duplicate guard as the form), the influencer's name as vendor, the menu
  value ex tax, `order_id` set — one per order, by a partial unique index;
- writes `ORDER_INFLUENCER_MEAL` (not `ORDER_VOIDED`) and `EXPENSE_CREATED`;
- frees the table as a void does.

**Value is menu price ex tax, before discount.** R9 puts tax only on an
invoice, and there is none. It is what the meal would have sold for, which is
what marketing spend means here — not food cost, which this system does not
know (recipe costing is excluded, ADR 0034).

**Manager or owner only (`discount.apply`).** A free meal is a 100% discount.
If a cashier could record one, they could take a customer's cash and book the
order as marketing: the theft ADR 0027 and ADR 0029 exist to catch, now with
a plausible paper trail. The server refuses; the till greys the button out.

**The expense cannot be deleted.** It is the only record of food that left
the kitchen unpaid. The ledger shows "Order #n" where Delete would be.

**Not a new order status.** `COMPLIMENTARY` would change the frozen
`OrderStatus` contract and every exhaustive switch over it. The expense link
is what tells this void from a real one, and the separate audit action keeps
it out of the void counts on the exceptions report and the daily email.

## Open question

**Whether PRA treats an influencer meal as a taxable supply.** The meal is
given in exchange for promotion, which an officer could call consideration in
kind, valued at open-market price. This design issues no invoice. If the
authority's answer is that one is owed, the change is to finalize a
zero-payment invoice and keep the expense row — the expense side stays as
built. Added to §20 as **P15**; not confirmed.
