# 0025 — gate imports of the mock entry point, and remove the two that shipped

**Status:** accepted
**Date:** 2026-09-05
**Milestone:** post-M19 (follow-on from ADR 0024's carried-forward list)
**Supersedes:** nothing in `docs/BUILD-PLAN.md`. §19's `mock-data-grep` gains a
fifth rule; no data contract changes (ADR 0008 holds — `toDomainLines` is a
function, not a schema), no migration, no permission change.

## Context

ADR 0024 fixed a web-order badge that counted `MOCK_WEB_ORDERS` on a live till,
and recorded the reason it had been possible: `mock-data-grep` bans mock
_declarations_ outside `mocks/`, and says nothing about production code
importing them. The fixture was in the right place; the caller was not, and no
gate looked at callers.

Switching that rule on immediately was not possible, because four production
imports already existed and would have failed the build. This ADR deals with
all four and then switches it on.

## The fifth rule

```js
{ id: 'mock-import',
  pattern: /(?:from|import|require)\s*\(?\s*['"][^'"]*\/mocks(?:\/[^'"]*)?['"]/ }
```

A path ending in `/mocks` is only ever legitimate from a location the gate
already permits — `mocks/`, `test/`, `*.mock.ts` and friends — so the rule
tests the import path rather than what is imported. It catches
`@natech/contracts/mocks`, a relative `../../contracts/mocks`, and the dynamic
`import()`/`require()` forms.

It was verified by reintroducing the exact line ADR 0024 removed and
confirming the gate fails on it, rather than by observing that a green run
stayed green. A rule whose regex never matches passes every build and protects
nothing.

## The four imports

**`toDomainLines` (three importers) — moved, not allowlisted.** It maps a
contracts `Order` onto `@natech/domain`'s pricing input. It contains no data.
It was in `mocks/orders.ts` only because that is where the first caller
happened to be, and `PaymentSheet`, `TaxInvoiceReceipt` and `BillPreviewReceipt`
price **live** orders through it. It now lives in `packages/contracts/src/orders.ts`
and is exported from the package root; `mocks/orders.ts` and `mocks/invoices.ts`
import it back from `src/`.

This is the general answer, not a special case: anything under `mocks/` that
production genuinely needs is by definition not mock data, and belongs in
`src/`.

**The admin settings registry — removed from the page.** This was the second
live C4 defect, and a worse one than the badge.

`/admin/settings?section=pos` rendered `SettingsRegistry` with
`MOCK_ALL_SETTING_DEFINITIONS`, `MOCK_SETTING_VALUES` and
`MOCK_SETTING_HISTORY`. A manager therefore saw fabricated current values for
`tax.policy.*`, attributed to a person who does not exist, above a fabricated
audit trail carrying a fabricated reason — on the screen whose §5.10 purpose is
to be the audit trail. `SettingsNav` shows this section to every role, and
`page.tsx` _forces_ `section = 'pos'` for a viewer without `settings.write`, so
it was the default settings screen for non-managers.

Worse than displaying it: `SettingsRegistry` has no server action. Editing a
value writes to local `draft` state and raises
`toast.show('success', '… updated and recorded')`. Nothing was persisted and no
audit row was written. A manager could change a tax-policy setting, be told in
as many words that it had been recorded, and reload to find neither true.

The `pos` section now renders `ServiceChargeSettings` alone — which is fully
wired, through `readServiceChargeSettings()` and
`saveServiceChargeSettingsAction`, with a required reason. Tax, the service
charge and the POS fee are what that screen was actually able to change, and
they are what it now offers.

## Consequences

- `toDomainLines` is exported from `@natech/contracts` rather than
  `@natech/contracts/mocks`. Four call sites updated; no behaviour change.
- The POS settings screen no longer shows setting definitions, values, or
  history. It keeps the controls that work.
- `friendlyHelp()` in `admin/settings/page.tsx` is deleted; it existed only to
  relabel the mock definitions.

## Carried forward

- **`SettingsRegistry.tsx` is kept but is now unreferenced by any page.** It is
  M05 groundwork and `test/settings.test.tsx` still proves its §5.10 behaviour
  — a HIGH-audit change refuses to save without a reason, and the before/after
  is stated. **Its save path is a stub**: it mutates local state and reports
  success. Whoever wires the `settings`/`setting_history` tables must replace
  `onConfirm` and the LOW/NORMAL branch with a real action before rendering it
  anywhere, or it will report a persisted change that never happened. That is
  recorded here because the misleading part is the part that looks finished.
- **`OrderCard` still renders no WEB badge** (ADR 0024), and
  `listTrayOrders` still hardcodes `customerName: null` while the tray searches
  on it.
