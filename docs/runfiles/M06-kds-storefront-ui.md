# M06 · kds-storefront-ui

**Milestone:** M06 · **Phase:** 1 — Static UI on mock data
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §10, §13, §15, §2 R13/R14, §21
**Status:** complete
**Preceding gate:** [M05](./M05-admin-ui.md) — passed

---

## 1. Purpose

The two surfaces nobody at the till ever looks at, and the two where the
product is judged: a cook two metres from a screen, and a customer holding a
phone.

M06 also closes Phase 1. §0 rule 7 freezes the data contracts at the end of this
milestone, and the reason to freeze them here rather than at the start of Phase 2
is that four apps have now been built against them. A shape that survives the
POS, the back office, a kitchen rail, and a public menu is a shape that has been
tested against the questions each of those asks.

---

## 2. Scope

**In:** KDS station picker and per-station ticket rail · all-day rail · course
lanes · bump and recall · per-station audio and burn-in mitigation · storefront
landing, menu, item detail, QR entry, cart sheet, OTP screens, and live order
status · the English/Urdu switch with `dir="rtl"`.

**Out:** SSE, IndexedDB, `next-intl`, R2 images, OG images, sitemap. M09a, M14,
M15, and M16 wire them.

---

## 3. Decisions

**R14 is structural, not observed.** The `Ticket` contract has no monetary
field, so a KDS surface has nothing to render a price from. A test additionally
asserts that no `data-money` element appears anywhere on a rail — the attribute
`Money` stamps on every figure it renders — which catches a price arriving by
some other route. The system this replaces prints tax-inclusive kitchen cards at
16% before the payment method, and therefore the rate, is known.

**Modifiers and notes are rendered at full size, in a contrasting treatment.**
§10.1 says so, and defect V5 records that the current system shows neither.
A cook reading `1× Mutton Karahi` has no way to know the guest is allergic to
nuts. On this rail the allergy line is larger than the item name.

**Tickets sort by `sent_at` ascending and never reorder.** §10.3 is explicit,
and the reason is spatial: a cook learns where a ticket is on the rail. An
overdue ticket is highlighted where it sits rather than promoted to the front.

**The storefront shows ex-tax prices and no total.** §13.2. The payment method
is unknown until the counter, so any inclusive figure would be a guess presented
as a price. The notice explaining that appears on the menu, in the cart, and on
the order status page.

**Localisation is a lightweight dictionary, not `next-intl`.** §15 assigns
`next-intl` to M15. What M06 needs is the Urdu content path exercised — RTL
layout, Nastaliq line height, Western digits for money — and a temporary
dictionary does that without pre-empting M15's routing decisions. The menu is
still server-rendered with real prices (§13.5); only the language choice is
client-side.

---

## 4. Gate

Phase 1 gate (§18): _"every screen navigable on mock data. UI review signed off.
Data contracts frozen."_

| #   | Criterion                                                    | Verified by                 | Result   |
| --- | ------------------------------------------------------------ | --------------------------- | -------- |
| G1  | No monetary value on any KDS surface                         | `kds.test.tsx` (R14)        | **PASS** |
| G2  | No negative duration on any KDS surface                      | `kds.test.tsx` (R13, V2)    | **PASS** |
| G3  | Tickets sort oldest first and do not reorder when overdue    | `kds.test.tsx` (§10.3)      | **PASS** |
| G4  | Modifiers and notes render at full size                      | `kds.test.tsx` (§10.1, V5)  | **PASS** |
| G5  | All-day rail aggregates outstanding quantity per item        | `kds.test.tsx` (§10.5)      | **PASS** |
| G6  | Storefront shows ex-tax prices and the §13.2 notice          | `storefront.test.tsx`       | **PASS** |
| G7  | The storefront renders in Urdu with `dir="rtl"`              | `storefront.test.tsx` (§15) | **PASS** |
| G8  | Every M06 route is reachable and builds                      | `pnpm build`                | **PASS** |
| G9  | Workspace green: typecheck, lint, test, build, gates, format | `pnpm run ci && pnpm build` | **PASS** |

---

## 5. Exit

- [x] All gate criteria pass
- [x] **Data contracts frozen** (§0 rule 7) — `packages/contracts/src`
- [x] **Next: M07 · auth**, which opens Phase 2 — [complete](./M07-auth.md)
