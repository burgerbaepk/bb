# 0016 — Reopening the order contract for a customer name and phone

**Status:** accepted
**Date:** 2026-08-27
**Milestone:** M20
**Supersedes:** nothing

## Context

The order screen shows no customer at all — not even the "Walk-in Customer"
label that `OrderCard.tsx` and `TaxInvoiceReceipt.tsx` already fall back to
when `Order.customerName` is null. That fallback has never had a real value
to fall back from: `customerName` is hardcoded `null` at all three places
that build an `Order` (`lib/orders/pricing.ts`, `lib/orders/queries.ts`,
`OrderScreen.tsx`'s own client draft) — the field was carried through Phase 1
(M06) as a placeholder for a feature Phase 2 never built.

The request is threefold: default the order to "Walk-in Customer"; let staff
attach a phone number to a walk-in, printed on the receipt and stored against
the order; and a "+" quick-add for a named repeat customer (name and phone
only). The schema already anticipated the storage side of this — `customers`
(§5.11: `email`, `phone`, `name`, nullable) and `orders.customer_id`
(§5.6) both exist from M02 — but `orders.customer_id` has never been written
to by any app code, and carries no foreign key.

ADR 0008 permits touching the frozen `packages/contracts/src` "when a
decision record states what surface required it and why the existing shape
could not answer." `OrderSchema` (`orders.ts`) is the surface: it is what
`CheckReceipt`, `TaxInvoiceReceipt`, and the fiscal payload builder
(`buyerName: order.customerName`) already read from, and none of them has
anywhere to read a phone number from today.

## Decision

**Add exactly one field to the frozen contract: `OrderSchema.customerPhone:
z.string().nullable()`**, alongside the existing `customerName`. Nothing
else in `packages/contracts` changes — `TrayOrderSchema` and `WebOrderSchema`
keep their own `customerName` untouched, because neither surface asked for a
phone (the tray card and the web-order inbox are out of this milestone's
scope; see the runfile).

**A walk-in's phone always resolves through the existing `customers`
table, found-or-created by phone**, not a new column on `orders`. Typing a
phone number (with or without a name) upserts a `customers` row by phone and
points `orders.customer_id` at it — the same table, and the same
`customerId`, that a "+", explicitly-named repeat customer would use. One
code path serves both halves of the request instead of two. This needs:

- A partial unique index, `customers_phone_idx` on `customers.phone WHERE
deleted_at IS NULL AND phone IS NOT NULL` — the same shape
  `customers_email_idx` (M02) already has for email, extended to the column
  this milestone actually writes.
- A foreign key on `orders.customer_id → customers.id`, closing a gap M02
  left open (the column existed with no constraint; `web_sessions.customer_id`
  has always had one to the same table).

Both are schema changes, generated as a real migration (R8) rather than
carried as an unconstrained column — the column is about to be written to
for the first time, and an unconstrained `orders.customer_id` pointing
nowhere in particular is worse than the column not existing.

## Consequences

- `loadPriceableOrder` (`lib/orders/pricing.ts`) — the one function
  `printCheckAction`, `finalizeOrderAction`, and the order screen's own
  initial load all share — joins `customers` once `orders.customer_id` is
  set. Every surface that already reads `order.customerName` (the check, the
  tax invoice, the fiscal `buyerName`) picks up a real value by construction,
  with no separate wiring per surface.
- The fiscal payload itself is untouched: PRAL's §7.3 field table has no
  buyer-phone field, and `packages/fiscal` is not part of this change.
- A phone typed for a brand-new number and a phone typed for a returning
  customer are the same action from the cashier's side; the second one
  recognises the name already on file rather than asking again.

## Alternatives considered

**A `customer_phone` column directly on `orders`, independent of
`customers`.** Rejected: a bare phone-only walk-in would never become a
recognisable customer record, and a named "+" customer would need a second,
parallel field (`customerId`) for the same purpose — two representations of
one fact, and two places for the check/invoice builders to reconcile instead
of one. Considered explicitly against the find-or-create approach and
rejected in favour of the latter (see the M20 runfile §3).

**Extend `TrayOrderSchema`/`WebOrderSchema` with the same phone field for
consistency.** Rejected: neither the active-orders tray nor the web-order
inbox was named in the request, and ADR 0008's bar is "what surface
required it" — extending a contract shape nothing asked for is exactly the
renegotiation §0 rule 7 exists to prevent.
