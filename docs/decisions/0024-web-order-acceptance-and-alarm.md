# 0024 — make the web-order badge real, gate the floor on acceptance, and ring until answered

**Status:** accepted
**Date:** 2026-09-05
**Milestone:** post-M19 (defect report from the product owner)
**Supersedes:** nothing in `docs/BUILD-PLAN.md`. §13.4 is implemented here as
written, not amended. No data contract changes (ADR 0008 holds — `TrayOrder`
already carried `channel`), no migration, no new permission.

## Context

The product owner asked for an audible alert when a storefront order lands, one
that does not stop until somebody acts on it, and said they suspected a bug in
the web-order acceptance flow.

There were three, and they compound. Together they mean a QR order could arrive
at a live till with **no signal at all**, and simultaneously be treated by every
other screen as an order staff had already agreed to make.

## The defects

**1. The web-order badge was mock data.** `apps/pos/app/(terminal)/layout.tsx`
computed its badge as `MOCK_WEB_ORDERS.filter(o => o.decision === 'PENDING')` —
the Phase-1 fixture set, imported into the shipped POS shell. The number was a
constant. It never moved for a real order, and it never moved back.

This is defect C4 — the "Popular Items listing dishes that are not on the menu"
failure the `mock-data-grep` gate exists to prevent — alive in the surface that
matters most. The gate did not catch it because it bans mock _declarations_
outside `mocks/`, and says nothing about production code _importing_ them. The
gate is unchanged here; that hole is recorded as carried-forward work below.

**2. An un-accepted web order was already a working order.** §13.4 is one line:
_never auto-accept a web order_. That rule lived in the inbox's Accept/Reject
buttons and nowhere else.

Every service surface asked only "is this order not `FINALIZED` or `VOIDED`?",
and a QR order waits at `PLACED`. So an order nobody had decided about was
already in the active-orders tray, already holding its table on the floor plan,
already counted in the tray badge, already loadable and already payable — and
`OrderCard` renders no channel badge, so it was visually identical to a POS
order. Staff could take payment for an order the floor had never agreed to
fulfil, which is precisely the outcome the "never auto-accept" rule is written
to prevent, and the customer watching `/order/[publicId]` would still be told
they were waiting for staff.

**3. The inbox had no poll backstop.** §16: "Poll every 3 seconds as a
correctness backstop on every consumer." `ActiveOrdersTray` and `FloorPlan`
have had that since M09b; `WebOrderInbox` had only the `EventSource`. A stream
that drops — a sleeping tablet, a recycled serverless function, a proxy idle
timeout — reconnects silently, and the inbox was the one surface where the
missed event meant an order sat unseen until a human reloaded the page.

## Decisions

**One predicate decides what is workable.** `apps/pos/lib/orders/workable.ts`
exports `workableOrder()`: not soft-deleted, not `FINALIZED`/`VOIDED`, and not
a `WEB` order still `PLACED`. It replaces four hand-copied `where` clauses in
`lib/orders/queries.ts` and one in `lib/floor/queries.ts`.

Copying was already demonstrably unsafe: `findOrderSummary` carried a comment
recording that it had been _the one caller of `orders.id` missing_ the closed
-order half. A predicate copied into five places is a predicate that will be
copied into a sixth incorrectly.

It is deliberately **not** applied to `transferTableAction`'s bulk order move.
A party that changes table takes its pending QR order with it; excluding it
there would strand the order on the table the party has left.

**The badge and the alarm read one query.** `readPendingWebOrders()` returns id,
order number, table code and time — narrow on purpose, because it runs on every
terminal screen every three seconds and must not drag every line and modifier
of every web order ever placed behind it the way `readWebOrders` legitimately
does for the inbox. The shell badge, the alarm, and the inbox therefore cannot
disagree about what is waiting (R16).

**The alarm is mounted in the terminal layout, not on the inbox.** The operator
who needs to hear a QR order arrive is by definition looking at something else;
a cashier mid-sale on the order screen is the case that matters. It is rendered
only once the till is identified — an alarm on the PIN lock has nobody to ring
for, and its poll would be refused anyway.

**Acknowledgement is per order, never global.** This is the whole difficulty in
"does not stop until manual action", and it is why the rule is a pure function
with a test (`lib/webOrders/alerting.ts`) rather than a condition inlined in an
effect. A global "silenced" flag mutes the _second_ order of the night, so
staff learn the alarm is unreliable. A flag that resets on every change to the
pending list rings again each time an unrelated order is accepted, so staff
silence it permanently at the browser. Either way the alarm ends up worse than
useless. Silencing acknowledges exactly the orders on screen at that moment;
an order that was not on screen then still rings when it lands. Accepting or
rejecting removes the order from `pending`, which is the stop §13.4 wants.

**The sound is synthesised, not shipped.** Three `OscillatorNode` pulses
through an `AudioContext`. No asset means nothing to cache in the service
worker for a PWA that must work offline (§8), nothing to 404 on a till that
installed the app before the file existed, and nothing added to the bundle. The
gain ramps rather than switching, because starting an oscillator at full
amplitude puts a step in the waveform that is audible as a click on the speaker
a till actually has.

**The sound is never the only signal** (§19). A till runs muted, in a noisy
kitchen, operated by people who may not hear it. The `role="alert"` bar is
on screen whether or not a tone ever played — and browsers refuse audio before
a first user gesture, so the audio is the half that is _expected_ to fail. Any
pointer or key event arms the context for the rest of the session.

## Consequences

- A pending web order no longer appears in the tray, on the floor plan, in the
  tray badge, or through `findOpenOrderForTable`/`findOrderSummary`. It appears
  in the web-orders badge and the alarm, which is §13.4's "POS tray badge and
  audible chime", and becomes a working order the moment it is accepted.
- The `/web-orders` inbox now polls every three seconds as well as subscribing.
- `test/setup.ts` gains a global mock for `@/lib/webOrders/actions`, because
  every suite rendering a till surface now pulls the alarm in behind the layout.
- `OPEN_ORDER_STATUSES` is gone from both `lib/orders/queries.ts` and
  `lib/floor/queries.ts`. It was misnamed in both — it listed the _closed_
  statuses, and `lib/floor/actions.ts` calls the identical list
  `NOT_OPEN_ORDER_STATUSES`. `workable.ts` names it `CLOSED_ORDER_STATUSES`.

## Carried forward

- **`mock-data-grep` does not detect a production import of
  `@natech/contracts/mocks`.** That is how defect 1 shipped. Three imports
  remain and were left alone as out of this ADR's scope: `toDomainLines` in
  `PaymentSheet`/`TaxInvoiceReceipt`/`BillPreviewReceipt` (a pure mapping
  helper that is merely misfiled under `mocks/`, not mock data), and
  `admin/settings/page.tsx`'s settings fixtures (the Phase-1 editor no
  milestone has wired). A gate rule banning the import path outside
  `mocks/`/test locations would have caught the badge, and should be written
  before either of those is touched.
- **`OrderCard` renders no channel badge.** §13.4's flow line asks for an
  accepted web order to carry a WEB badge. `TrayOrder.channel` is already on
  the frozen contract and already mapped; only the markup is missing. Less
  urgent now that an un-accepted order cannot reach the tray at all.
- **`listTrayOrders` hardcodes `customerName: null`** while
  `ActiveOrdersTray`'s search haystack includes it, so a web order can never be
  found by customer name.
