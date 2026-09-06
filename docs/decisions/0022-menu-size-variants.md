# 0022 — One product per size family

**Status:** accepted
**Date:** 2026-09-05

The owner requested one product with selectable sizes across the current menu.
This supersedes ADR 0012's separate-row rule for size families.

The 89 source price-list entries become 66 products, including 13 families with
36 variants. Pizza recipes remain separate products; each has its own available
sizes. Double Pizza Deal, Fries, Drink, Sting, Mineral Water, Nuggets, Baked Wings,
and Fried Wings also use variants. Larger side portions are labelled `Large`,
without an invented piece count, as requested by the owner. Distinct recipes,
proteins, deal compositions, and add-ons retain their own products.

`SOURCE_MENU_ITEMS` retains the original SKU/price mapping. `VARIANT_FAMILIES`
explicitly identifies groups; no name or price heuristic guesses equivalence.
The first source SKU remains the parent, with the smallest listed portion as the
default. Variants use price deltas so every selling price remains unchanged.
The storefront's product action opens size selection for products with variants.

For an existing database, run `pnpm --filter @natech/db db:consolidate-menu`
to preview and append `--apply` to apply. The migration uses live database prices,
keeps parent IDs, soft-deletes sibling products, and records each complete source
row in the audit log. Historical order references and snapshots are untouched.
It refuses partial conversions or customized option/tax/category/availability
settings. All families commit in one transaction; a rerun skips converted families.
Future reference-data seeding uses the consolidated structure as well.

Old sibling SKUs are retained in historical rows and the source mapping, but are
no longer separate searchable products. Existing storefront product URLs based
on the retired names are replaced by the consolidated product URLs.
