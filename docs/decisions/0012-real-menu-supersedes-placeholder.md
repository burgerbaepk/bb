# 0012 — the restaurant's real menu supersedes the §5.3/§5.4 placeholder

**Status:** accepted
**Date:** 2026-08-25
**Milestone:** none — a data/content change against the already-complete M08

## Context

§5.3 seeded eight priced lines from the Appendix A.1 reference invoice and
marked the rest `NEEDS_PRICE`, explicitly deferred until "the restaurant's
full price list" arrived (`packages/db/seeds/menu.ts`'s own doc comment).
§5.3 also specified a variant collapse — `Special Mutton Mix Olive` as one
item with `Full`/`Half` variants — and §5.4 gave a five-station category map
built from the category _names_ alone, before any product numbering existed.

The restaurant has now supplied that full price list, transcribed verbatim:
15 categories in a fixed order, 81 numbered products, and — critically — its
own product numbering, which the §5.3 placeholder had no way to anticipate.

## Decision

1. **Seed the restaurant's menu exactly as given.** Every category name,
   product number, product name, and rate in `packages/db/seeds/menu.ts` is
   transcribed verbatim from the restaurant's document, including its
   deliberate irregularities: product 85 (`Taka tak`) sits under
   `02 Mutton Karahi`, not `12 Taka Tak`; product 84 (`Extra`) sits under
   `Extra`; numbers 80–83 do not exist. None of this is "corrected."
2. **No variant collapse.** The restaurant numbers `Special Mutton Mix Olive
Full` and `Half` as two separate products (9 and 10), not one item with a
   size choice. `item_variants` carries no product-number field of its own,
   and the fast-billing search (`ProductSearch`, below) depends on every
   numbered line having its own exact-match `sku`. So §5.3's collapse is
   dropped entirely: every numbered line, including every Full/Half and
   Olive/Butter/Black Pepper/Pickle split, is its own `menu_items` row. This
   removes about a third of the tile-count saving §5.3 was written for, but
   the category strip was sized for 81 real items either way, and a wrong
   product-number lookup (a cashier keying `10` and getting asked Full or
   Half instead of the Half priced at 10) is a worse defect than an
   uncrowded strip.
3. **`sku` changes role: from an internal mnemonic to the restaurant's own
   customer-facing product number.** Previously `MTK-4PC`; now `5`. It is
   what `apps/pos/components/order/ProductSearch.tsx` matches on exactly
   when a cashier types digits and presses Enter — BUILD-PLAN's own
   §5.3/§7.6 shape of the column (`text`, unique where not null) did not
   need to change, only what gets put in it.
4. **§5.4's station map is extended, not overridden**, for the three
   categories it never named: `03 Mutton Machli Karahi` joins `KARAHI`
   (fish karahi, same station as the mutton karahi it sits beside in the
   restaurant's own list), `12 Taka Tak` takes the `GRILL` slot §5.4 gave
   `03 Taka Tak` (renumbered, not moved), and `Raint mazdoori` joins `COLD`
   alongside `Extra` — a non-kitchen adjustment line, not a station that
   cooks anything.
5. **`Raint mazdoori` and `Raita` are seeded with categories and no
   products.** The restaurant named both categories but supplied no items
   for either. Inventing products would put a price in front of a customer
   that nobody at the restaurant set — worse than an empty category, which
   is at least honestly empty.
6. **Fast keyboard billing is built alongside the data**, since the product
   numbers only pay for themselves if a cashier can type one and have it
   land: `ProductSearch` (exact-number and name lookup, arrow-key results,
   Enter-to-add) and an editable quantity field on each cart line
   (auto-focused and pre-selected on add, so typing a digit replaces the
   default `1` outright) on `apps/pos/components/order/OrderScreen.tsx`.

## Consequences

- `packages/db/seeds/menu.ts`'s `MenuItemSeed` no longer carries a
  `variants` field, and `seedMenu()` in `seeds/index.ts` no longer touches
  `item_variants` at all — every existing installation's `item_variants`
  rows from the old collapsed items become orphaned once those `menu_items`
  rows are replaced. Acceptable here: the seed script never deletes a row an
  operator might have edited (its own house rule), and this is a pre-pilot
  content replacement, not a live-menu migration with orders against it.
- Every item ships `nameUr: null`. The restaurant's document gave English
  only; inventing Urdu translations risked shipping wrong ones under a
  correct-looking UI, and Urdu is out of scope until M15 regardless
  (`branding` seed's `locale.enabled: ['en']`).
- `ItemOptionsSheet` (variant/modifier/seat/note picker) still exists and is
  still reachable — an item with variants or modifier groups still opens it.
  It is simply never reached by _this_ menu, which has neither. A future
  menu that does use variants goes through it exactly as before M08 built it.
