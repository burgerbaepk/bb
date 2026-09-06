# 0014 — a live tax preview in the cart, once a tender is picked

**Status:** accepted
**Date:** 2026-08-26
**Milestone:** post-M18 (hardening-phase UI request, not a numbered milestone)

## Context

§6.9's table is explicit: before a check exists, the cart may show only
`Subtotal (ex tax)` and a prompt to print the check for the full total. No
tax figure, no grand total. §21 names why — defect C5, "cart labels `Tax
(16%)` regardless of method", and defect C1, "`Grand Total Rs. 1` with
finalize enabled" on an empty order. `Cart.tsx`'s own doc comment and
`cart.test.tsx` both assert this as a hard rule, not a style preference: cash
and card are taxed at different rates (16% vs 8%), so a tax figure shown
before the tender is known is either a guess or, in the legacy system §21
describes, a flat number that is simply wrong half the time.

A request came in to redesign the order screen's footer — a consolidated
Finalize/Void/Check/Orders panel, a dine-in/takeaway/delivery selector, and a
live Net/Tax/Grand-total readout, cash selected by default — modelled on a
screenshot that turned out to be exactly the legacy system §21 catalogues:
same `Rs. 1` grand total on nothing, same flat `Tax (16%)`. Building it
as shown would reintroduce C1 and C5 verbatim.

## Decision

The redesigned cart footer extends §6.9, rather than breaking it, on one
point:

1. **`Subtotal (ex tax)` still renders unconditionally, exactly as before.**
   Nothing about the always-on figure changes.
2. **A Net/Tax/Grand-total block appears only once the cashier has actively
   toggled a tender** (`Cart`'s existing CASH/CARD control, now defaulted to
   CASH per the request rather than to "unknown"). Tapping the selected
   method again clears it back to null — "unknown, both rates" — and the
   block disappears, reverting to the original §6.9 hint text. This is an
   explicit, cashier-initiated statement of intent, not a guess: the figure
   always tracks whichever method is currently toggled, so switching from
   Cash to Card immediately re-rates the block rather than leaving a stale
   16% on screen (the opposite of C5, not a repeat of it).
3. **The block is computed by `estimateCheck`** — the same `@natech/domain`
   estimator the offline check-print branch already calls in
   `OrderScreen.tsx` — never a second tax calculation. It is a preview only;
   `PaymentSheet`'s own `computeTotals` call remains the one authoritative
   figure at finalize, and the printed check remains the one authoritative
   figure before that. Nothing here writes anywhere.
4. **The block, and the whole cart footer, still refuse to appear on an
   empty order.** `livePreview` is null whenever `lines.length === 0`, and
   `Finalize order`/`Check`/`Void` stay disabled the same way `Print check`
   already was — C1 is not reopened.

A dine-in/takeaway/delivery selector was added alongside this (`OrderType`
already carried `DELIVERY` in the frozen `packages/contracts` schema —
`ADR 0008` is untouched, nothing here is a new data contract, only a UI
control for a value the schema already allowed and the POS screen never
exposed). A "Finalize order" button was added to open `PaymentSheet` directly
from a fresh cart, which the screen could not do before this without a
`?orderId=…&action=pay` round trip through the tray. Void was wired to the
existing `voidOrderAction` for a placed order, and to a local cart-clear (no
server object exists yet) otherwise. An "Orders" button opens the existing
`ActiveOrdersTray` in a dialog rather than navigating to `/orders`.

## Consequences

- `cart.test.tsx`'s existing assertions (`assumedMethod={null}` renders no
  tax figure at all) keep passing unchanged, since the preview only appears
  once a method is actively selected; new tests cover the CASH-default and
  CASH/CARD-toggle cases.
- A cashier who never touches the tender toggle — or explicitly clears it —
  sees exactly the original §6.9 cart: subtotal only, both rates deferred to
  the printed check. The extension is opt-in by construction.
- `Cart` itself never imports `@natech/domain`'s tax engine; `OrderScreen`
  computes `livePreview` and hands down plain `Paisa` figures, so the
  component boundary §6.9 relies on (no tax math inside the display layer)
  is unchanged.
