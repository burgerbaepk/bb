# M22 · storefront layout

**Milestone:** M22 · **Phase:** 3 — Hardening
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §13.1, §13.2, §13.5, §15.2, §19, §2 R1/R12/R16
**Preceding gate:** [M21](./M21-settings-registry.md) — M21's own gate PASS; the tree carries nine gate violations from concurrent Storefront SEO work, listed in M21 §4.

---

## 1. Purpose

The product owner supplied a foodpanda restaurant page as a reference and asked
for the storefront to be brought to that standard: structurally sound, visually
appealing, easy to use.

The reference is worth taking seriously for structural reasons, not decorative
ones. Three things it does that this storefront does not:

**It lists, it does not tile.** `MenuBrowser` renders a two-to-five column grid
of square photo cards. Each card spends roughly 350px of height and a viewport
holds about six. The reference uses two-column list rows — name, price,
description, small thumbnail — at roughly 120px each, so a viewport holds ten
to twelve _and_ shows more readable text per item. A photograph sells the first
item on a menu; it does nothing to help somebody find the fourth. On a menu of
forty items across ten categories the grid is a scrolling marathon.

**It keeps the order in view.** The reference devotes its right third to a
standing order panel with a running total. This storefront has `CartBar`, a
floating pill — right on a phone, and on a 1440px desktop it leaves the right
third empty while the customer has no standing view of what they have added or
what it costs.

**It navigates from one place.** Categories currently appear twice — a sub-nav
strip in `StorefrontShell` and a pill row inside `MenuBrowser` — and search is a
third control in the header. The reference has one sticky bar: search on the
left, category tabs with counts beside it. Two navigation systems for one job
are worse than one.

---

## 2. Scope

**In:**

- `apps/storefront/components/MenuList.tsx` — new. The list-row menu section:
  two columns at `lg`, one below, each row carrying name, description, price,
  thumbnail and the add control. Replaces the card grid inside `MenuBrowser`.
- `apps/storefront/components/OrderPanel.tsx` — new. The standing order summary
  for `lg` and up: lines, quantities, running subtotal, checkout. Sticky.
- `apps/storefront/components/MenuToolbar.tsx` — new. One sticky bar holding
  in-menu search and the category tabs with per-category counts.
- `apps/storefront/components/PopularRail.tsx` — new. The photo-card rail the
  reference leads with, driven by **real sales** (below).
- `apps/storefront/lib/menu/popular.ts` — new. `readPopularItems()`: the most
  ordered items over a trailing window, aggregated in SQL from finalized
  invoices, matched back onto `PublicMenu`.
- `apps/storefront/components/MenuBrowser.tsx` — recomposed around the four
  above; keeps its search filter, its empty state and its category derivation.
- `apps/storefront/components/StorefrontShell.tsx` — the duplicate category
  sub-nav removed; the header keeps identity, locale, sign-in and cart.
- `apps/storefront/components/StoreHero.tsx` — restructured into a compact
  identity block: name, cuisine line, hours, address, and the menu anchor.
- `apps/storefront/messages/en.json`, `ur.json` — new keys. §15.2 holds: every
  string added in both, money stays Western digits.

**Out, and why:**

- **Breadcrumbs.** The reference is a marketplace listing many restaurants;
  CLAUDE.md's framing is one restaurant per deployment. A trail reading
  `Homepage › Karachi › Burger Bae` has two rungs that go nowhere.
- **Star rating and review count.** There is no reviews table and no review
  capture anywhere in this product. Rendering `4.2/5 (500+)` would be a
  fabricated figure on a shipped surface — defect C4, the exact class ADR 0025
  removed from the admin settings screen two milestones ago.
- **Delivery / Pick-up toggle.** `apps/storefront/lib/orders/actions.ts` derives
  the order type from the QR token: a table token means `DINE_IN`, its absence
  `TAKE_AWAY`. There is no delivery path and no pickup path distinct from it, so
  the control would have one real option and a decorative second.
- **Deals, vouchers, "app-only deals".** No promotions engine, and no app.
- **Contract changes.** `PublicMenu` is frozen (ADR 0008). `PopularRail` reads
  a separate query rather than adding a flag to `PublicMenuItem`.
- **No change to pricing, tax display, or the checkout flow.** §13.2's "ex tax,
  no inclusive counterpart" holds throughout; `Money` stays the render
  boundary (R1).

---

## 3. Decisions

**"Popular" is measured, not curated.** The reference's Popular rail is the
first thing on the page, and it is the one element that cannot be faked here.
`readPopularItems()` aggregates `order_lines` against finalized invoices over a
trailing window — the same shape as `apps/pos/lib/dashboard/queries.ts`'s
`readTopItems`, and for the same reason: rounding in `numeric`, no float, one
grouped query rather than a fold over every line. It returns items matched back
onto `PublicMenu`, so a dish that has been delisted cannot reappear on the
storefront through the sales table. **If there are no qualifying sales the rail
does not render** — an empty "Most ordered" is worse than no rail, and a
placeholder list would be the fabrication this milestone exists partly to
avoid.

**Rows for browsing, cards for the rail.** The two treatments are not
inconsistent: a card is right when there are six items and the photograph is
the argument; a row is right when there are forty and the name and price are.
That is why the reference uses both, and it is the shape adopted here.

**The order panel is `lg`-and-up only, and `CartBar` keeps the phone.** A
sticky right column on a 390px viewport is a modal in disguise. `CartBar`
already solves the phone case well; the panel fills the desktop dead space it
cannot.

**One navigation, made sticky.** The shell's category strip is deleted rather
than the in-page one, because the in-page row is the one that knows the
per-category counts of the _filtered_ set — R16's principle, that a summary is
a function of the rows being rendered, applies to a count on a tab as much as
to a total on a table.

---

## 4. Gate

| #   | Assertion                                                                     | Method                                                                                                                                                         | Result   |
| --- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | The menu renders as list rows, two columns at `xl`, one below                 | `MenuRow` replaces the card grid; the existing menu suite (pricing, size selection, Urdu names) passes unchanged                                               | **PASS** |
| 2   | Categories are navigable from exactly one control                             | The shell's strip and its `categories` prop are deleted; `layout.tsx` no longer reads the menu at all                                                          | **PASS** |
| 3   | Popular is derived from finalized invoices and renders nothing without them   | `readPopularItems` aggregates `order_lines` against non-deleted invoices; `PopularRail` returns `null` on an empty list; 5 tests in `lib/menu/popular.test.ts` | **PASS** |
| 4   | No fabricated rating, review count, or deal appears on any storefront surface | None was added; `StoreHero`'s doc records the refusal and why                                                                                                  | **PASS** |
| 5   | Every new string exists in `en.json` **and** `ur.json` (§15.2)                | `test/i18n.test.ts` asserts key parity in both directions, and that no Urdu string is its English original                                                     | **PASS** |
| 6   | `Money` remains the only money render path (R1)                               | No new component formats a figure; every price is a `<Money>`                                                                                                  | **PASS** |
| 7   | Storefront suite passes                                                       | 55 tests, 8 files                                                                                                                                              | **PASS** |
| 8   | `pnpm run ci` green; every app builds                                         | typecheck, lint and 650 tests pass; all four gates pass; `pnpm build` passes                                                                                   | **PASS** |

---

## 5. Exit

The storefront menu is rebuilt around the three structural moves the reference
design gets right, and refuses the four it cannot honestly copy.

**Rows instead of tiles.** `MenuRow` replaces the square photo card. A viewport
now holds ten to twelve dishes rather than about six, and each one has more
readable width for its name and description, not less — the width is no longer
a fifth of the page. `PopularRail` keeps cards, because a shortlist of six is
the one place a photograph is the argument.

**The desktop right column earns its space.** `OrderPanel` is a sticky summary
at `lg` and up: lines, quantities, running ex-tax subtotal, checkout.
`CartBar` is untouched and still owns the phone, where a sticky column would be
a modal in disguise.

**One navigation.** `MenuToolbar` carries search and the category tabs in one
sticky bar. The shell's duplicate category strip is gone, and so is the header's
second search box, which posted to the same `/menu?q=`. The surviving control is
the in-page one because only it knows the counts of the _filtered_ set (R16).

**Popular is measured.** `readPopularItems` counts finalized invoices over a
trailing thirty days; `matchPopular` refuses any sold name without a live,
available menu item behind it, and the rail renders nothing on an empty result.
That join direction is the point: `order_lines.name_snapshot` records what a
guest was charged for months ago, and starting from the menu instead would have
read the same and let a delisted dish back onto a public page — defect C4 in its
original form.

### The nine gate violations are gone

They were carried in from concurrent Storefront SEO work and are fixed here
rather than silenced.

**Seven `brand-grep` (R12) hex literals.** `theme_color`, `background_color`
and `themeColor` are brand identity — they tint an installed PWA's splash
screen and the Android address bar — and a literal shipped one client's red to
every deployment. Both apps now resolve them per request from the `branding`
settings row, the same row `brandCssVariables()` already reads: the POS through
its existing `readBrandConfig()`, the storefront through a new narrow
`readBrandChrome()`. The colours came out of both `public/manifest.json` files
entirely, and each key is **omitted** rather than defaulted when the row has no
theme, so a half-configured deployment gets the browser's own chrome instead of
somebody else's colour.

**One `brand-grep` reference string.** The banner alt text transcribed the copy
printed on the supplied images, which hardcoded a city _and_ a trading name
into a message catalogue. It is now `{name} promotional banner`, with the name
from `outlet_config`. The deeper reason is not R12: the banners are supplied
per deployment, so an alt text transcribing image copy the deployment can
replace is guaranteed to describe the wrong picture eventually — worse for a
screen-reader user than an accurate general description.

**Two `mock-data-grep` `example.com` hits.** Both are IANA's reserved
illustration domain (RFC 2606 §3) showing the shape of a valid site origin, not
stand-in asset hosts, so both carry `mock-grep-allow` with the reason on the
line. Substituting a real-looking domain to dodge the rule would be the worse
answer, because somebody owns those.

Two things were fixed on the way through:

- **An R12 slip of my own.** The first draft of the identity block hardcoded
  `/images/burger-bae-icon.png`. The header already carries the logo directly
  above, so the second copy went rather than the rule.
- **`CheckoutFlow` had no landmark.** The storefront now has two surfaces
  titled "Your order" — the checkout and the standing panel — and a
  screen-reader user moving by landmark could not have told the summary from
  the thing that takes payment. It is a labelled `<section>`.

### Carried forward

| Item                                               | Why it is not in M22                                                                                                                                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The item detail page is a route, not a modal       | The reference opens a dish over the menu, which keeps the customer's place in a long list. A route is correct for SEO (§13.5 wants every dish crawlable) so the answer is an intercepting route, not a swap — a milestone of its own. |
| No cuisine tags on the identity block              | `outlet_config` has no cuisine field and ADR 0008 freezes the contracts. Worth a column if the owner wants the reference's `Burgers · Fast Food · Western` line.                                                                      |
| Per-banner alt text                                | The alt is now one generic, name-parameterised string for both banners. Distinct alt per image belongs with the banners themselves once they are manageable rather than a hardcoded asset list.                                       |
| `BannerSlider` still sits above the identity block | It predates M22 and was left alone. Whether a carousel earns the first screen at all is a separate question from how the menu is laid out.                                                                                            |
