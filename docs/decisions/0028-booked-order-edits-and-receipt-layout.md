# 0028 — booked-order type changes, percentage discounts, and the receipt layout

**Status:** accepted
**Date:** 2026-09-25
**Milestone:** post-M23
**Supersedes:** the sentence "A saved order retains its type; start a new order
to change it" in [ADR 0027 (delivery charges)](0027-delivery-charges.md).
Adds two optional fields to `TrayOrderSchema`. That is a change to a frozen
contract ([ADR 0008](0008-freeze-data-contracts.md)), recorded here rather than
made silently, as ADR 0015, 0018, 0019 and 0027 did before it. Both fields are
optional, so every payload written before this change still parses. No schema
change and no migration.

## Context

The product owner sent four photographs from the pilot till, with five
requests:

1. The printed bill should look finished, with its important parts easy to
   see. A delivery address in particular should be bold and larger. On the old
   bill it printed as one regular-weight line under the customer name, and the
   rider reads it off the bag.
2. The booked-orders card should show the delivery address.
3. The card's payment toggle should default to Cash, as the till does. It
   defaulted to Card, so the first figure the cashier saw was one they were not
   going to collect.
4. The order type should be easy to change after booking. The only way to do
   it was to void the order and key it again, which left a void in the
   exceptions report for something that was not an exception.
5. A discount should be enterable as a percentage.

## Decision

**Changing the type of a booked order.** `changeOrderTypeAction` changes the
type of any order that is not finalized or voided. It runs straight away from
the order screen, without waiting for Save. The type decides whether the order
holds a table, so the table has to be settled at the moment of the change:

- Moving away from dine-in closes the table session. The table is freed if no
  other open order is on it, the same release `reassignOrderTableAction`
  performs.
- Moving to dine-in takes the smallest free table that fits the party, locked
  with `SKIP LOCKED`, the same choice `placeOrderAction` makes for a new order.
  If no table is free, the change is refused.
- Moving away from delivery clears the address and the delivery charge.
  Otherwise they would stay on the order unseen and come back if it were
  switched to delivery again.

The change is written to the audit log as `ORDER_TYPE_CHANGED`, inside the
same transaction (R7). No tax or other priced figure is stored against the
type, because tax is computed once, at finalize (R9), so none needs
recomputing. A booked order's type cannot be changed while the till is offline
(§8), because the table release has to happen on the server.

The server check in `placeOrderAction` that refuses a type mismatch is kept.
The client now changes the type through the new action before any save, so
reaching that check means the client is stale.

**Percentage discounts.** `DiscountDialog` has an Amount / Percent switch. A
percentage is a whole number, converted to paisa once, rounding half up
(`percentOf`), and stored as an amount exactly like a rupee discount. The
order, the invoice and the exceptions report still have only one way to hold a
discount. The percentage is kept in the reason text, as in
`Promotion (10%)`, so the exceptions report shows what was actually offered.
The supervisor threshold and the offline block apply to the converted amount,
as before.

**The booked-orders card.** The card shows the customer's name and phone,
which the query previously left out: every card said "Walk-in Customer". For a
delivery it also shows the address in a "Deliver to" block. The payment toggle
lists Cash first and selects it by default.

**The receipt.** The bill preview and the tax invoice now build their shared
blocks from `ReceiptFrame.tsx`: the title, order details, delivery address,
items and total. The two documents can no longer drift apart. The text uses
the body sans-serif font instead of monospace. Solid black appears in two
places only, the document title and the total. Both use
`print-color-adjust: exact` because browsers otherwise treat the fill as a
background graphic and leave it off the page. The delivery address is the
largest text on the paper after the total, in a box with a heavy border. The
ESC/POS path does the same with a new `tall` (double-height) line, which is
also used for the total.

No figure, label or condition required by PSTSA s.30(1) has moved or changed.
The receipt tests that check wording when tax is off still pass unchanged.

## Consequences

- A cashier can move an order between dine-in, takeaway and delivery with a
  single tap. Each move leaves an audit row.
- An order with nothing on it but its type is no longer voided and keyed
  again, so the voids in the exceptions report are real voids.
- A booked order's type cannot be changed while the till is offline. The
  cashier is told to reconnect.
- The percentage survives only as reason text. A report that needs discount
  percentages as data would need a column. There is no such report today.
