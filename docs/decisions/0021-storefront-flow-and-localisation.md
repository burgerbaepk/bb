# 0021 — storefront: repair the ordering flow, finish the localisation, and remove the hardcoded hero

**Status:** accepted
**Date:** 2026-09-05
**Milestone:** post-M19 (defect sweep, not a numbered milestone)
**Supersedes:** nothing. It corrects `apps/storefront` against rules and clauses
already in force — R12, §13.2, §13.4, §15.1, §16 — and against
[ADR 0019](0019-remove-check-printed.md), which the storefront's customer-facing
copy had not been updated for.

## Context

The product owner asked for a review of the storefront's flow, usability and
interface, and for the defects found to be fixed. What the read turned up was
not a design problem with a few rough edges; it was three groups of defect, each
with the same underlying cause — the storefront was built surface by surface and
never re-read as one flow.

## Decision

### Controls that were not controls

**The cart could only count down.** Where the cart's increment belonged sat a
`<Plus>` that was `disabled`, `aria-hidden`, and `opacity-0` — a spacer drawn as
a button. A customer who wanted a second naan had to navigate back to the menu
to get one. The cause is visible in `CartProvider`: `add` takes a
`PublicMenuItem`, and the cart screen holds `CartLine`s, so there was no method
the cart could have called. `increment(lineId)` is that method, and it is the
exact mirror of the `remove(lineId)` that was already there.

`removeLine(lineId)` lands with it. Decrementing five of something five times is
not a way to change your mind about it, and it was the only way the cart offered.

**`bg-surface-muted` is not a token.** The token layer has `surface`,
`surface-raised` and `surface-sunken`. The sign-in/sign-up toggle asked Tailwind
for a fourth, so its background was simply never painted. It is now a
`SegmentedControl` from `@natech/ui`, which also retires the `role="tablist"` /
`role="tab"` markup it carried: those roles promise a `tabpanel` that never
existed. `Button` and `TextField` replace the hand-rolled control markup around
it for the same reason — the design system already answers all of it.

**The sign-in step was one-way.** No back control, and the cart it was
collecting a password for was off screen. `common.back` had been sitting in both
message catalogues, unused, since M15.

**The item page was built as a leaf.** The sticky cart bar lived inside
`MenuBrowser`, so tapping Add on an item page — the screen a customer reaches by
tapping the dish they actually want — looked like nothing happening. It is
`CartBar` now, mounted by every surface that can add to the cart. The same page
also offered "Add" again for something already in the cart rather than its
count, and never checked `isAvailable` at all: the list greys a sold-out dish
out, and this page would happily add it, with the customer finding out at the
counter.

`QuantityStepper` is the one quantity control across all three surfaces, so
"the menu's stepper and the cart's stepper disagree" stops being expressible.

### Copy that was false or untranslated

**§15.1 gives the storefront full localisation, and roughly twenty visible
strings were hardcoded English** — the search field and its label, the category
navigation, the section headings and counts, the sticky cart bar, both error
messages, and the whole footer. An Urdu customer got a half-English interface.
All of it is in `messages/{en,ur}.json` now, and the catalogues are key-for-key
identical.

**The status screen promised a document that no longer exists.** ADR 0019
removed the pre-payment check outright, and `status.payAtCounter` still read "A
check with the full total is brought to your table". The copy now describes the
tax invoice handed over at the counter, which is what actually happens.

**The status screen also could not tell a paid order from an unpaid one.**
`publicOrderStatus` derives `decision` by collapsing everything past `PLACED`
into `ACCEPTED`, so an order that had been served, paid for and closed still read
"Accepted" under a notice telling the customer to go and pay. `status` is on the
contract already; the screen reads it, shows "Completed" on `FINALIZED`, and
shows the pay notice only while there is something left to pay.

**A search that matched nothing rendered an empty page** — no explanation, and no
way back to the full menu but the browser's own back button.

### Identity written into source

**The hero was `<Image>` pointing at a client-specific JPG under `/images/`,
captioned with that client's trading name.** Both halves are R12 violations, and
`brand-grep` could not see either: the gate's `trading-name` rule still spells
the reference deployment this repository was started from, not the client
actually deployed. It also rendered on `/menu` as well as `/`, because neither
page ever passed `showHero`.

`StoreHero` replaces it — name, address and hours from `outlet_config`, ground
from the token layer. It draws on the `.store-hero` gradient that was already in
`globals.css`, written for exactly this and then left unreferenced when the JPG
arrived; its own comment says why it is a gradient rather than an image.
`text-amber-300` in the footer went the same way: a Tailwind swatch survives
every rebrand unchanged, which is the thing R12 is about.

### Two smaller ones

**`LiveOrderStatus` polled every three seconds forever**, including after a
rejection or a finalized invoice — a request every three seconds from a phone
back in the customer's pocket, for a row that R5 forbids anyone from changing
again. It stops at a terminal state.

**`/menu?q=` was indexable.** The query is unbounded, so every crawlable
permutation of it is a near-duplicate competing with `/menu`, and none of them is
a page anyone linked to. Search results are `noindex, follow`.

## Consequences

- **The photo hero is gone, not relocated.** Nothing in `BrandConfig` or
  `outlet_config` can hold a hero image, so there was no brandable way to keep
  it. Restoring one means an optional `heroImage` on the branding identity
  schema plus a field in the branding editor — worth doing, and deliberately not
  smuggled into a defect sweep.
- **`brand-grep` is still blind to this class of defect.** Its `trading-name`
  rule matches `khizer`, so it passes over `apps/pos/components/auth/
SignInForm.tsx` (a hardcoded logo path and `alt`), `apps/pos/lib/branding/
config.ts` (the full client identity in `FALLBACK_BRAND_CONFIG`), and the test
  that asserts that identity is correct. `apps/storefront` is clean of it as of
  this decision; `apps/pos` is not, and tightening the rule is what would prove
  it either way. Left alone here because `config.test.ts` reads as a deliberate
  choice ("the project-owned marks") rather than an oversight, and reversing a
  deliberate choice is the owner's call.
- The header search still clears itself on the results page. Prefilling it needs
  `useSearchParams`, which forces a Suspense boundary on two ISR routes; the
  "Results for …" heading and the clear-search control cover the same need for
  the cost of neither.
