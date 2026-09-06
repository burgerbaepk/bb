# 0017 — Persisting the order-level discount §5.6 left out

**Status:** accepted
**Date:** 2026-08-27
**Milestone:** none (bug fix, reported against the live M09b/M10 cart)
**Supersedes:** nothing

## Context

§6.3's reference invoice states the calculation chain explicitly:

```
Line subtotal            12,220.00
Order discount                0.00
─────────────────────────────────
Taxable base             12,220.00
```

`Order discount` is additive with, not a substitute for, `order_lines.line_discount`
(`estimateCheck`/`computeTotals`'s own `orderDiscount` input — `discountTotal =
linesDiscountTotal(priced) + orderDiscount`, `packages/domain/src/tax/engine.ts`).
`OrderSchema` (`packages/contracts/src/orders.ts`) already carries
`orderDiscount`/`discountReason` fields for exactly this. The Cart's
`DiscountDialog` already lets a cashier apply one, and it visibly displays.

None of it reached the taxable base. §5.6's schema, as first written, lists no
order-level discount column on `orders` — only `order_lines.line_discount`.
`lib/orders/pricing.ts`'s `loadPriceableOrder` documented the gap honestly
(`orderDiscount`/`discountReason` hardcoded to zero/null, "this file has no way
to see" the cart's local state) rather than hiding it, but the consequence
reaches further than that one file: neither the online check
(`printCheckAction`) nor the actual charge (`finalizeOrderAction`) ever
receives a discount, online or offline. A cashier applying a discount changed
nothing about what the customer was charged.

## Decision

**Add `orders.order_discount bigint not null default 0` and
`orders.discount_reason text`**, a real migration (R8) — the same posture ADR
0016 took for `customers.phone`, and for the same reason: an unconstrained
concept living only in client state was worse than the column not existing,
now that it is about to be written to for the first time.

**A new action, `setOrderDiscountAction`, persists it** — the same shape as
`setOrderCustomerAction` (§ same file), gated on `discount.apply` (the
permission `canDiscount` already checks client-side to show the button at
all, now enforced server-side too, since a value that reaches
`finalizeOrderAction` needs the same authorization at write time that decided
whether the button was ever visible). Called from `OrderScreen` the moment
`DiscountDialog` confirms or a discount is removed, the same "ensure a real
order exists first" opening move `handleSaveCustomer` already makes.

**`loadPriceableOrder` reads the real columns.** `printCheckAction` and
`finalizeOrderAction` need no new parameter at all — both already load
`priceable.order` and pass its fields into `estimateCheck`/`computeTotals`;
adding `orderDiscount: order.orderDiscount` to each is the entire change on
that side. This was deliberately not done by threading discount through as a
raw client-supplied parameter to either action instead: that would let any
caller assert an arbitrary discount at the moment of charging with no
permission check behind it, rather than only ever transmitting a value this
session already wrote under `discount.apply`.

**The two client-local previews (`OrderScreen`'s live cart preview, and the
offline check estimate) and the offline `computeTotals` inside
`handleFinalize` all pass `orderDiscount: discount`** from local state
directly — correct for a preview computed before any round-trip, and for
offline finalize, which cannot wait on one.

## Consequences

- A migration lands in `packages/db`, generated and committed per R8.
- `buildQueuedOrder`'s offline sync payload already carried `orderDiscount`
  (§8's queued-order shape); the replay endpoint that consumes
  `QueuedOrderSchema` now writes it to the new column instead of dropping it
  on the floor.
- `order_checks.discount_total`/`invoices.discount_total` — both already
  real columns — now receive a genuine, non-zero figure when a discount was
  applied, rather than always zero.

## Alternatives considered

**Thread `discount`/`discountReason` as a raw parameter on
`printCheckAction`/`finalizeOrderAction` instead of persisting it.** Rejected:
cheaper (no migration), but it moves a money-affecting figure across the
client/server boundary with no server-side authorization check of its own —
`assertPermission(viewer, 'discount.apply')` would have to be duplicated onto
two payment-adjacent actions rather than enforced once, at the one place the
value is actually set.

**Compute "order discount" as `Σ order_lines.line_discount` and drop
`orderDiscount` from the engine input entirely.** Rejected: the engine already
models the two as additive, separate figures, and no code path in this
codebase writes a non-zero `line_discount` — collapsing them would still
require the missing column, just as `line_discount`'s order-level sibling
under a different name.
