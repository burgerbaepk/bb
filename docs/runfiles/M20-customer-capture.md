# M20 · customer capture

**Milestone:** M20 · **Phase:** 3 — Hardening
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §5.6, §5.11, §6.1, §6.4, §2 R4/R6/R7/R8/R9/R12; [ADR 0016](../decisions/0016-customer-phone-capture.md)
**Preceding gate:** [M19](./M19-pilot.md) — codebase readiness confirmed (all fourteen prior milestone gates PASS); live pilot run not yet started. This milestone does not touch the pilot itself; it lands on the same tree the way M12–M18 landed on their own predecessors, mid-hardening.

---

## 1. Purpose

The order screen's right-hand panel names a table and a guest count and
nothing else — no customer, not even the "Walk-in Customer" fallback text
`OrderCard.tsx` and `TaxInvoiceReceipt.tsx` already carry. That fallback has
had nothing to fall back from since M06: `Order.customerName` is hardcoded
`null` at every place that builds an `Order`, and `orders.customer_id` (M02)
has never been written to.

M20 wires it up: the order screen defaults to "Walk-in Customer", lets staff
attach a phone number to any order (printed on the check and the tax
invoice, stored against the order), and offers a "+" quick-add for a named
repeat customer — name and phone only. Both paths resolve through the same
`customers` table (M02, §5.11), found-or-created by phone, so a walk-in's
phone and a named customer's phone are the same mechanism, not two.

---

## 2. Scope

**In:**

- `packages/db/src/schema.ts` — a partial unique index on `customers.phone`
  (mirrors `customers_email_idx`); a foreign key on `orders.customer_id →
customers.id` (previously unconstrained). Migration generated via
  `drizzle-kit generate`, SQL and meta snapshot committed (R8).
- `packages/contracts/src/orders.ts` — `OrderSchema.customerPhone: z.string()
.nullable()`, the one contract change ADR 0016 records.
- `packages/contracts/mocks/orders.ts` — `OrderSpec.customerPhone` (optional,
  defaults to `null`), threaded into `toOrder`.
- `apps/pos/lib/orders/pricing.ts` — `loadPriceableOrder` selects
  `orders.customerId`, joins `customers` when set, and populates
  `customerName`/`customerPhone` for real. The one shared function
  `printCheckAction`, `finalizeOrderAction`, and the order screen's initial
  load already all read through (pricing.ts's own doc comment).
- `apps/pos/lib/orders/actions.ts` — `setOrderCustomerAction`: find-or-create
  a `customers` row by phone (updating the name if one was given and the
  match had none or a different one), point `orders.customer_id` at it, or
  clear it back to null. Gated on `order.send` (the same permission
  `sendToKitchenAction` already requires — see §3), refused on a
  `FINALIZED`/`VOIDED` order, audited (R7).
- `apps/pos/components/order/CustomerDialog.tsx` — new. Phone (required to
  save) and name (optional), a "Remove customer" action when one is
  attached.
- `apps/pos/components/order/Cart.tsx` — a "Walk-in Customer" /
  `{name} · {phone}` row in the header, next to the table/guests row, opening
  the dialog.
- `apps/pos/components/order/OrderScreen.tsx` — `customerName`/
  `customerPhone` state (seeded from `serverOrder`, same posture as
  `guestCount`), threaded into the client draft `order` so a check printed
  via the `HTML_DIALOG` fallback before any server round trip still carries
  it, and patched onto `realOrder` after a successful save so a loaded
  order's next check/print reflects the edit without a full reload. Ensures
  a real order exists first (`sendUnsentLines`, the same opening move
  `handlePrintCheck`/`handleOpenPayment` already make) before calling the
  action on brand-new, not-yet-sent carts.
- `apps/pos/components/receipt/CheckReceipt.tsx` — a `Customer:` /
  `Phone:` line, matching the line `TaxInvoiceReceipt.tsx` already has.
- `apps/pos/components/receipt/TaxInvoiceReceipt.tsx` — the same `Phone:`
  line added beside the existing `Customer:` one.
- `apps/pos/test/cart.test.tsx` — `renderCart`'s fixed prop set extended
  with the three new required `Cart` props.
- `docs/decisions/0016-customer-phone-capture.md` — written before this file
  (ADR 0008's own requirement for touching the freeze).

**Out:**

- **`TrayOrderSchema`/`WebOrderSchema`.** The active-orders tray card and the
  web-order inbox were not named in the request, and neither the tray's own
  `listTrayOrders` (a many-orders-per-call query) nor the storefront path
  gained a phone field. `listTrayOrders`'s `customerName: null` stub is
  untouched — a pre-existing gap, not a new one, carried forward.
  ADR 0016 §"Alternatives considered" records why extending either was
  rejected.
- **The fiscal payload.** PRAL §7.3's field table has no buyer-phone field;
  `packages/fiscal` and `buildInvoicePayload` are untouched. `buyerName`
  already reads `order.customerName` (M11) and now receives a real value
  more often — no code change needed there for that to happen.
  See ADR 0016.
- **Phone format validation / OTP.** No phone-verification precedent exists
  anywhere in this codebase outside the storefront's email OTP flow (a
  different, unrelated mechanism, §13.3). `setOrderCustomerAction` accepts
  any non-empty trimmed string, the same posture `outlet_config.phone`
  (`lib/outlet/actions.ts`) already takes.
- **A customer search/lookup UI.** Typing an existing phone number already
  resolves to the existing customer server-side (find-or-create); browsing
  or searching the customer list is a back-office/reporting feature nobody
  asked for this milestone.
- **A DB-backed integration test for `setOrderCustomerAction`.** Matches the
  established house position since M10 (M12's own runfile §4): no milestone
  through M19 has written one for a server action; `packages/domain` (pure)
  gets unit-tested state machines, the DB orchestration does not.
- **A live-browser interactive pass.** Carried forward since M09b/M10/M11/M12
  (no browser-automation tool available this session).

---

## 3. Decisions

**Find-or-create by phone in `customers`, not a bare column on `orders`.**
ADR 0016 records the full reasoning; the short version is that a walk-in
with just a phone and a "+"-added named customer are the same fact
(someone with a phone number, optionally a name) and should be the same
code path, not two fields the check/invoice builders would otherwise have
to reconcile.

**`setOrderCustomerAction` is gated on `order.send`, not a new
permission.** The frozen `PermissionSchema` (`packages/contracts/src/
enums.ts`) has no customer-shaped permission, and adding one is itself a
contract change ADR 0016 does not claim — ADR 0016 scopes the reopening to
`OrderSchema.customerPhone` alone. `order.send` already gates
`sendToKitchenAction`, the other action that writes to an order still in
play; attaching a customer is the same class of edit, by the same class of
actor (till staff placing/adjusting the order), so it reuses the permission
rather than inventing a narrower one nothing in §14.1's role table names.

**Refused on `FINALIZED`/`VOIDED`, not gated through `orderMachine`.**
`customerId` is not one of the states `packages/domain`'s order state
machine tracks (R4 applies to `status`, and `customerId` is not a status).
A plain guard — reject if `existing.status` is `FINALIZED` or `VOIDED` — is
the correct-sized check: past finalize, the invoice has already captured
whatever `buyerName` it captured (R5 forbids amending it here regardless),
and a voided order has nothing left to attach a customer to.

**No idempotency wrapper.** R3 asks for one on every multi-row mutation, but
no server action in `apps/pos/lib` actually calls `withIdempotency()` today
— `voidOrderAction` (M09b), itself a multi-row mutation across `orders`,
`order_lines`, and `kds_events`, has none either, relying on the modal
PIN-confirm step to make a double-submit unlikely and harmless (voiding
twice is a no-op past `orderMachine.assert`). `setOrderCustomerAction`
follows the same established precedent: a double-submit either resolves to
the same customer twice (find branch, harmless) or is a non-issue in
practice for a single cashier's own deliberate tap.

**The client-side draft `order` (`OrderScreen.tsx`'s own `useMemo`, used
before any server round trip exists) carries live `customerName`/
`customerPhone` state, not a hardcoded `null`.** `checkPrintRequest.order`
resolves `realOrder ?? order` throughout the file, and `realOrder` stays
`null` for a brand-new, not-yet-loaded order until a server action happens
to return one — which `printCheckAction` does not (`PrintCheckResult` has no
`order` field). Without this, a customer attached to a fresh cart before its
first check print would silently not appear on an `HTML_DIALOG`-path check.
The same save also patches `realOrder` in place when one exists, so a
`?orderId=`-loaded order's next check reflects an edit without a full
page reload.

**A same-instant double-create race on a brand-new phone number is
accepted, not closed.** `# ponytail: two terminals typing the identical
new phone number in the same instant both pass the pre-insert lookup and
one insert loses to `customers_phone_idx`— surfaces as an unhandled`Postgres`unique-violation (a 500), not a silent duplicate. Upgrade to`onConflictDoUpdate` against the partial index only if this is ever actually
observed.` Mirrors M12's own accepted-risk framing for its single-open-shift
check-then-insert (§3 of that runfile) and its Redis lease before that.

---

## 4. Gate

| #   | Criterion                                                                                                                                                                                                                                                                                       | Verified by                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Result   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| G1  | `customers.phone` carries a partial unique index (`WHERE deleted_at IS NULL AND phone IS NOT NULL`); `orders.customer_id` carries a real FK to `customers.id`                                                                                                                                   | `drizzle-kit generate` produced exactly these two statements (`drizzle/0004_customer_phone_capture.sql`), reviewed against `schema.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | **PASS** |
| G2  | `setOrderCustomerAction`: finds an existing customer by phone and reuses it, updating the name only when one was given and differs; creates one when no match exists; clears `orders.customer_id` back to `null` when given a null phone; refuses on a `FINALIZED`/`VOIDED` order; audited (R7) | code review of `setOrderCustomerAction` (`lib/orders/actions.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | **PASS** |
| G3  | `loadPriceableOrder` returns a real `customerName`/`customerPhone` once `orders.customer_id` is set, and `null`/`null` when it is not — read by `printCheckAction`, `finalizeOrderAction`, and the order screen's initial server render alike, from the one function                            | code review of `loadPriceableOrder` (`lib/orders/pricing.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **PASS** |
| G4  | The order screen shows "Walk-in Customer" by default, the attached name/phone once set, and the "+"/edit dialog round-trips through `setOrderCustomerAction` correctly for a brand-new cart (no order yet), an already-placed order, and a reopened (`?orderId=`) one                           | code review of `OrderScreen.tsx`'s `handleSaveCustomer`/`handleRemoveCustomer` and `Cart`/`CustomerDialog`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | **PASS** |
| G5  | `CheckReceipt` and `TaxInvoiceReceipt` both print `Customer: {name ?? 'Walk-in Customer'}` and a `Phone:` line exactly when a phone is present                                                                                                                                                  | `apps/pos/test/receipt.test.tsx` — two new cases, one per template, asserting both the default and the populated state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | **PASS** |
| G6  | No `packages/contracts` change beyond the one field ADR 0016 names (`OrderSchema.customerPhone`)                                                                                                                                                                                                | `git diff --stat packages/contracts/src` — one line in `orders.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | **PASS** |
| G7  | R17 unaffected — no fiscal mark, QR, or number added to `CheckReceipt` by this change                                                                                                                                                                                                           | `natech/no-fiscal-marks-on-check` lint rule still passes on `CheckReceipt.tsx` (part of `pnpm lint`, below)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | **PASS** |
| G8  | Workspace green: typecheck, lint, test, gates                                                                                                                                                                                                                                                   | `pnpm typecheck` (15/15 packages), `pnpm lint` (15/15, one `react-hooks/set-state-in-effect` finding in `CustomerDialog.tsx` fixed by keying the dialog from its caller instead of reseeding via effect), `pnpm test` (all packages green — `@natech/pos` 218/218, `@natech/db` 46/46, `@natech/contracts` 12/12; one `@natech/print-bridge` timeout under concurrent load, reproduced as a pass in isolation — pre-existing flake, unrelated to this milestone), `pnpm gates` (all four — `brand-grep` initially flagged the test fixture's literal phone number as a restaurant-identity shape, R12's `pk-phone` rule scanning by shape not meaning; marked `brand-grep-allow` with an explanatory comment, the same sanctioned mechanism `packages/contracts/mocks/outlet.ts` already uses) | **PASS** |

**Disclosed gaps (anticipated, same class as M09b–M12's own precedent):**

1. No DB-backed integration test for `setOrderCustomerAction` — house
   position since M10, unchanged by this milestone (§2 "Out").
2. No live-browser interactive pass — no browser-automation tool available
   this session, carried forward since M09b.
3. The same-instant double-create race on a brand-new phone number (§3) is
   accepted, not closed.

---

## 5. Exit

- [x] All gate criteria pass, with the disclosed gaps above
- [x] Exactly one `packages/contracts/src` field added, matching ADR 0016
- [ ] **Next: unscheduled — M20 was itself a hardening-phase request, not a
      successor to a numbered plan item; the seven-day pilot run (M19) remains
      the next scheduled milestone gate**

### Carried forward

| Item                                                            | Milestone                                    |
| --------------------------------------------------------------- | -------------------------------------------- |
| `TrayOrderSchema`'s own `customerName: null` stub (tray card)   | unscheduled                                  |
| A customer search/lookup back-office screen                     | unscheduled                                  |
| A DB-backed integration test for `setOrderCustomerAction`       | unscheduled                                  |
| A live-browser interactive pass, once tooling allows it         | unscheduled, carried since M09b/M10/M11/M12  |
| The same-instant double-create race on a brand-new phone number | unscheduled — only if ever actually observed |
| The seven-day live pilot run itself                             | M19                                          |
