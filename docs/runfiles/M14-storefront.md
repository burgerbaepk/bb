# M14 · storefront

**Milestone:** M14 · **Phase:** 2 — Wiring
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §13, §5.11, §16, §2 R1/R2/R4/R6/R7/R9/R12, §14.1
**Preceding gate:** [M13](./M13-reporting.md) — all ten gate criteria PASS; `docs/runfiles/M13-reporting.md` §5 names M14 as next

---

## 1. Purpose

`apps/storefront` is, today, exactly what M06 shipped: every route and
component renders `@natech/contracts/mocks` data, there is no `lib/` directory
and no `app/api/` directory, and the app has zero backend-capable
dependencies. The web-order lifecycle's other half — `apps/pos`'s
`/web-orders` inbox — is in the identical state: Accept and Reject are
`toast.show(...)` calls with no server action behind them. M14 is the
milestone that wires both halves for real: a customer can scan a QR code,
browse the real menu, verify an email, place an order, and watch it live;
staff can accept it (firing it to the kitchen with a WEB badge) or reject it
with a reason the customer sees.

---

## 2. Scope

**In:**

- **Menu**, real: `apps/storefront/lib/menu/queries.ts` reads `menu_items`/
  `categories`/`item_variants`, ISR 300s on `/menu`, real `generateMetadata`
  and JSON-LD on the item-detail route.
- **QR table binding**, real: `apps/storefront/lib/tables/queries.ts` resolves
  `qr_tokens` → `tables`/`zones`, increments `scan_count`.
- **Customer auth (email OTP)**: `apps/storefront/lib/auth/{otp,session,
cookies}.ts`; route handlers `app/api/otp/{send,verify}/route.ts` (the plan
  names these as literal `POST` paths, §13.3, not server actions); rate limits
  from `otp_codes` itself, no new table; a signed httpOnly session cookie
  (`storefront.sessionDays`, default 90) under a new `customer-session`
  `@natech/auth` token purpose.
- **Session cart**: `web_sessions.cart` persisted via a small server action
  called on every cart mutation once a session exists; hydrated back into
  `CartProvider` on the next visit.
- **Place**: `apps/storefront/lib/orders/actions.ts`'s `placeOrderAction` —
  re-resolves every price server-side from `menu_items`/`item_variants`,
  never from the client's cart (§3 — this is the milestone's one real
  security decision).
- **Accept / reject**, real, in `apps/pos`: `lib/webOrders/{queries,
actions}.ts`, wired into the existing `WebOrderInbox`/`web-orders/page.tsx`
  (both currently pure mock/toast).
- **Live status**: `/order/[publicId]` real query plus the same
  raw-`EventSource` + 3-second-poll pattern `useFloorRealtime` already
  established, applied to a new `web-orders` realtime channel.
- **SEO**: real `sitemap.ts`, `robots.ts`, a `JsonLd` component (`Restaurant`,
  `Menu`/`MenuSection`/`MenuItem` with `offers`, `LocalBusiness`), canonical
  URLs, and a `next/og`-generated OG image per item.
- **R2 images on the storefront**: `next/image` against R2's public URL,
  producing AVIF/WebP with explicit dimensions (§3 — not the dedicated
  resizing Worker the plan names, a documented default).
- Two small, justified extractions to shared packages (§3): order-number
  allocation to `packages/db`; a new `customer-session` token purpose in
  `packages/auth`; a new `web-orders` channel in `packages/realtime`.

**Out:**

- **Resend webhooks / bounce-and-complaint admin surface** (§13.3's last
  sentence). A self-contained observability feature — a new table, a webhook
  route, signature verification, an admin panel — that blocks nothing else
  here. Carried forward.
- **The dedicated R2-resizing Worker** (§13.5). No Cloudflare account to
  provision or deploy against this session; `next/image` satisfies the same
  requirement (AVIF/WebP, explicit dimensions) today. Carried forward as an
  infra task, the same way M00 named `services/fiscal-relay` as its own
  deploy and this is not that.
- **`RealtimeProvider`**. `apps/pos` and `apps/kds` both already carry the
  identical "no provider mounted, hand-roll `EventSource`" debt
  (`useFloorRealtime.ts`'s own doc comment); fixing it for all three apps at
  once is bigger than "storefront," so the storefront takes on the same
  workaround rather than being the milestone that retires it everywhere.
- **Measuring Lighthouse/Core Web Vitals.** Built to the practices that earn
  the score (ISR, server-rendered menu, `next/image`, self-hosted fonts, no
  client-side menu fetch) — no browser-automation tool this session to run
  Lighthouse itself, the same disclosed gap as every milestone since M09b.
- **A `packages/contracts` change.** `storefront.ts`/`orders.ts` already
  carry every shape this milestone needs (verified against the frozen file
  directly); see §3 on why `publicId`, `decision`, and accept/reject
  permissions all resolve without touching it.

---

## 3. Decisions

**The client-submitted cart price is never trusted.** `CartLine.unitPriceExTax`
travels with the cart for display only. `placeOrderAction` takes `itemId`/
`variantId`/`qty`/`note` from the cart and re-resolves `unitPrice`, the tax
class, and the station from live `menu_items`/`item_variants`, exactly the
way `sendToKitchenAction` snapshots from the menu rather than from whatever
the cart claims. A public, unauthenticated write path that priced from its
own request body would be a standing invitation to place a fully-loaded order
at whatever total the client felt like sending.

**`publicId` is `orders.client_order_uuid`, not a new column.** The mock data's
`WEB-20394` reads as a human-typed code, but `order_no` resets daily and is
only unique per business date (`orders_business_date_no_idx`) — using it in
a public tracking URL would let today's order #12 collide with yesterday's.
`client_order_uuid` is already `uuid`, `unique where not null`, and — for a
POS order — exists precisely to be "the token this specific order transaction
is keyed by, from the client's perspective" (§8's offline-replay key). A web
order has no offline-replay concept, but it needs the identical shape: an
opaque, unique, client-facing handle on one specific order. Reusing the
column costs no migration and extends a concept that already fits, rather
than bolting on a second column that would mean the same thing.

**Accept reuses `order.send`; reject reuses `order.void`. No new
permission.** Six milestones running (M08–M13) have each stated, as a
deliberate line item, that they made no `packages/contracts` change — the
dominant house pattern. Accepting a web order **is** "send to kitchen" by
another name (§13.4: "on accept, the order fires to KDS"); rejecting one that
was never cooked is the identical `PLACED → VOIDED` transition
`voidOrderAction` already performs, with the same reason-on-the-line shape.
Neither needs a bespoke permission string, and both are already granted to
`WAITER`/`CASHIER`/`MANAGER` (§14.1's "Orders" line), which is exactly who
should be triaging these.

**`decision`/`rejectReason` are derived, never stored.** `orders`/
`order_lines` carry no such columns, and none is added.
`decision = status==='VOIDED' ? 'REJECTED' : status==='PLACED' ? 'PENDING' :
'ACCEPTED'`; `rejectReason` is the (shared) `voidReason` on the order's own
lines. This mirrors M13's own exceptions-report precedent of deriving a
report-shape field from a structured column rather than inventing storage
for it.

**Order-number allocation moves to `packages/db`; business-date computation
does not.** Both apps insert into the one `orders` table and must agree on
`order_no` under the same collision-and-retry rule (`orders/orderNoLogic.ts`'s
own doc comment: `MAX(order_no)+1`, retry exactly once on a unique-index
collision) — two independent copies of _that_ logic is a real risk: if they
ever drift, the failure mode is a production collision, not a cosmetic bug.
`nextOrderNoFrom`/`isOrderNoConflict`/`withOrderNoRetry`/`readMaxOrderNo` move
from `apps/pos/lib/orders/` into `packages/db` (beside `allocateCheckNo`/
`allocateLocalNo`, the identical category of shared, DB-backed allocator),
`apps/pos/lib/orders/actions.ts` updates its one import line, and
`apps/storefront` imports the same functions. Business-date computation
(`computeBusinessDate`) is pure, stable, already unit-tested, and carries no
shared-mutable-state risk from a second copy — it is duplicated into
`apps/storefront/lib/businessDate.ts` (with its own small test), the same
"small helpers duplicated over one shared utility" house style M11–M13 already
established for `readSettingValue`.

**A new `@natech/auth` token purpose, `customer-session`; no new
`web_sessions` column.** The signed cookie's payload is `{ webSessionId }`;
`requireCustomerSession()` verifies it, loads the `web_sessions` row, and
checks `expiresAt`. `KeyPurpose`/`TokenPurpose` are designed to grow this way
— `kds-station` was added at M09a for an identical reason (a new caller
needing a signing purpose the staff-side purposes must not answer for) — and
this is not the frozen contract ADR 0008 governs.

**`storefront.sessionDays` is a `settings` row, default 90**, read with the
same "one JSON blob, safe fallback" shape `readTaxPolicy`/`readCheckPolicy`
already use — not hardcoded, per the plan's own instruction to make it a
setting.

**R2 images serve through `next/image`, not a dedicated resizing Worker.**
§13.5 names a Worker; standing one up needs a Cloudflare account this session
cannot provision, and `next/image` against R2's public URL already produces
AVIF/WebP at explicit dimensions — the same requirement, met by what is
already available rather than new infrastructure nobody can deploy this
session. Carried forward, same footing as any other named-but-unprovisioned
infra dependency in this codebase (§20's own pattern: a default until
resolved).

**Rate limits read `otp_codes` directly — no new table.** "3 sends per email
per hour" and "5 per IP per hour" are both `COUNT(*) FROM otp_codes WHERE
email = ? AND created_at > now() - interval '1 hour'` (and the `ip` column
equivalent); "5 verify attempts per code" is `otp_codes.attempt_count`,
already the column for it.

**The email OTP endpoints are real route handlers, `POST /api/otp/send` and
`POST /api/otp/verify`, not server actions.** §13.3 spells out these two
literal paths — unusually mechanism-specific for this plan — and a route
handler gives the natural place to read the request IP for the per-IP rate
limit without reaching into `headers()` from inside a server action. `PLACE`
is a server action: nothing in the plan names a path for it, and it is
already an authenticated, same-origin mutation exactly like every other
action in this codebase.

---

## 4. Gate

| #   | Criterion                                                                                                                                                                                                                                                                        | Verified by                                                                                                                                                                                                                                                                                                                                                                                                                    | Result   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| G1  | Menu, QR resolution, and order status all read live tables — no `MOCK_*` import remains in a real route                                                                                                                                                                          | `mock-data-grep` gate; code review                                                                                                                                                                                                                                                                                                                                                                                             | **PASS** |
| G2  | `placeOrderAction` prices every line from `menu_items`/`item_variants` at call time; a cart line's own `unitPriceExTax` never reaches the insert                                                                                                                                 | code review of `placeOrderAction`                                                                                                                                                                                                                                                                                                                                                                                              | **PASS** |
| G3  | Accept: `PLACED → IN_KITCHEN`, lines routed to stations, `kds_events` written, WEB badge visible on the ticket, `order.send`-gated. Reject: `PLACED → VOIDED`, reason on every line, `order.void`-gated, a rejected order is never later accept-able (state machine, not a flag) | code review of `lib/webOrders/actions.ts`; `orderMachine`'s own transition table                                                                                                                                                                                                                                                                                                                                               | **PASS** |
| G4  | A web order is never auto-accepted — no code path reaches `IN_KITCHEN` without an explicit accept call from an authenticated till identity                                                                                                                                       | code review                                                                                                                                                                                                                                                                                                                                                                                                                    | **PASS** |
| G5  | OTP: 6-digit code, `hashSecret`/`verifySecret` storage, 10-minute TTL, single use (`consumedAt`), 5 verify attempts then burned, 3/email and 5/IP sends per hour, code never logged or returned in a response body                                                               | code review of `lib/auth/otp.ts`                                                                                                                                                                                                                                                                                                                                                                                               | **PASS** |
| G6  | The storefront shows ex-tax prices only, on the menu, the cart, and the order-status page — no inclusive figure or grand total anywhere (§13.2, §6.9)                                                                                                                            | existing `storefront.test.tsx` assertions, unchanged and still passing                                                                                                                                                                                                                                                                                                                                                         | **PASS** |
| G7  | R16 — the web-order inbox's header count/value derive from the rows rendered, unchanged from the M06 markup                                                                                                                                                                      | code review (`WebOrderInbox`'s summary line untouched)                                                                                                                                                                                                                                                                                                                                                                         | **PASS** |
| G8  | Order-number allocation is one implementation (`packages/db`), used identically by both apps; `apps/pos`'s own order-number tests still pass after the move                                                                                                                      | `packages/db/test/orderNo.test.ts` (moved, unmodified assertions)                                                                                                                                                                                                                                                                                                                                                              | **PASS** |
| G9  | Sitemap and robots are generated from live categories/items and `outlet_config`, not hardcoded; JSON-LD emits `Restaurant`, `Menu`, `MenuSection`, `MenuItem`, `LocalBusiness` fed from the same real data                                                                       | code review of `sitemap.ts`, `robots.ts`, `JsonLd.tsx`                                                                                                                                                                                                                                                                                                                                                                         | **PASS** |
| G10 | No `packages/contracts` change                                                                                                                                                                                                                                                   | `git diff --stat packages/contracts/src` — empty                                                                                                                                                                                                                                                                                                                                                                               | **PASS** |
| G11 | Workspace green: typecheck, lint, test, build, gates                                                                                                                                                                                                                             | `pnpm typecheck`/`pnpm lint` (15/15 packages), `pnpm test` (`@natech/storefront` 19/19 including the new `businessDate.test.ts`; `@natech/pos` 182/182; every other package green; `packages/db`'s own pre-existing `auth-attempts.test.ts` timing flake, carried since M09a, is the sole exception, unrelated to this milestone), `pnpm build` (all four apps, including every new storefront route), `pnpm gates` (all four) | **PASS** |

**Disclosed gaps (same class as every milestone since M09b):**

1. No DB-backed integration test for the new server actions, route handlers,
   or query modules — unchanged house position since M10. Only
   `businessDateLogic.ts`'s arithmetic is genuinely framework/DB-free and
   gets its own unit test (`lib/businessDate.test.ts`); the OTP rate limits
   and the `decision`/`rejectReason` derivation are both inline within
   `dbWrite`/`dbRead`-touching functions rather than extracted pure helpers,
   so they fall under the same disclosed gap as the rest of this milestone's
   DB orchestration, verified by code review rather than a unit test.
2. No live-browser interactive pass through the QR-scan-to-live-status flow,
   and no Lighthouse/Core Web Vitals run — no browser-automation tool
   available this session, carried since M09b.
3. Resend bounce/complaint tracking is unbuilt (§2 Out).
4. The dedicated R2-resizing Worker is unbuilt; `next/image` stands in (§3).
5. `RealtimeProvider` remains unmounted in all three apps; the storefront's
   live-status page uses the same raw-`EventSource` workaround `apps/pos`/
   `apps/kds` already carry.

---

## 5. Exit

- [x] All gate criteria pass, with the disclosed gaps above
- [x] No change to `packages/contracts/src` — the freeze holds
- [ ] **Next: M15 · urdu**

### Carried forward

| Item                                                                                                                                                                                                         | Milestone                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Resend webhooks — bounce/complaint tracking and an admin surface for it                                                                                                                                      | unscheduled                                 |
| A dedicated Cloudflare Worker resizing R2 images                                                                                                                                                             | unscheduled — needs real infra provisioning |
| `RealtimeProvider`, retiring the raw-`EventSource` workaround in all three apps at once                                                                                                                      | unscheduled — carried since M09a/M09b       |
| A live-browser interactive pass and a real Lighthouse/CWV run, once tooling allows it                                                                                                                        | unscheduled, carried since M09b             |
| The pre-existing `auth-attempts.test.ts` timing failure (M09a §4)                                                                                                                                            | unscheduled                                 |
| A thumbnail on `MenuBrowser`'s list rows — `next/image` is wired on the item-detail page only; the M06 list markup never had an image slot and this milestone added one page's worth, not a redesign of both | unscheduled                                 |
