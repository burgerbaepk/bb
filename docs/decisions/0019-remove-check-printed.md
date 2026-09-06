# 0019 — remove the printed check and every check dependency

**Status:** accepted
**Date:** 2026-08-29
**Milestone:** post-M19 (hardening-phase request, not a numbered milestone)
**Supersedes:** M10's `check-and-payment` scope (the check half of it) in
`docs/BUILD-PLAN.md`, §6.4/§6.5/§6.8/§6.13/§9.1's check-specific clauses, R17's
literal wording (moot the same way R14 became moot under ADR 0018), and every
check-shaped field `packages/contracts` froze at the end of M06 (ADR 0008).
ADR 0014's live cart tax preview is fully reverted by this decision.

## Context

The product owner asked for the pre-payment check removed outright — not
hidden, not disabled — along with every place `apps/pos` depends on it:
printing, reprinting, voiding, the reprint chain, the abandoned-check
compliance signal, and the `CHECK_PRINTED` stage of both the order and table
lifecycles. The stated goal is a shorter, more comfortable flow: an order goes
straight from being served to being paid, with the tax invoice at finalize as
the first and only document a customer receives.

The dependency ran deeper than the print button itself. `printCheckAction`
allocated a real `check_no`, wrote `order_checks`, and was the only thing that
moved an order/table into `CHECK_PRINTED`; `handleOpenPayment` called it
silently just to get the order into a payable state before opening
`PaymentSheet`; the cart's live tax preview (ADR 0014) existed only to show
what a check would quote before printing one; the compliance dashboard's
fifth panel and one of `readShiftReport`'s own metrics existed only to catch a
check that never became an invoice; and the offline replay path queued and
replayed check rows as part of a captured sale.

Chosen flow, decided with the user before implementation: **`SERVED` → the
payment sheet directly → `FINALIZED`.** This was already a legal, exercised
edge on both machines (a takeaway with nothing to print could already reach
`FINALIZED` straight from `SERVED`); this decision makes it the only edge.

## Decision

Every field or code path that existed only to serve the printed check is
removed rather than left dormant.

- **`packages/domain`**: `state-machines/order.ts`'s `OrderStatus` loses
  `CHECK_PRINTED` — `orderMachine` now runs `DRAFT → PLACED → SERVED →
FINALIZED`, `VOIDED` reachable from every non-terminal state, same as
  before. `state-machines/table.ts`'s `TableStatus` loses `CHECK_PRINTED` —
  `SERVED` and `ORDERED` now edge directly to `PAYING`, and `PAYING` returns
  to `SERVED` (not a printed check) when a payment sheet closes unsettled.
  `tax/estimate.ts` deleted in full (`estimateCheck`, `detectMethodMismatch`,
  `CheckEstimate`, `CheckEstimateEntry`, `MethodMismatch`) — the whole reason
  it existed was to price a document before payment; `computeTotals` already
  does the one authoritative computation at finalize, with the real payment
  method known. `tax/policy.ts` drops `CheckPolicy`, `DEFAULT_CHECK_POLICY`,
  `BOTH_RATES_METHODS`.
- **`packages/db`**: `schema.ts` drops the `order_checks` table, the
  `check_counter` table, `checkModeEnum`, `invoices.final_check_id`, and
  `CHECK_PRINTED` from both `orderStatusEnum` and `tableStatusEnum`.
  `counters.ts` drops `allocateCheckNo`. Migration
  `0007_remove_check_printed` (generated, not hand-written, per R8), with one
  hand-appended piece no generator can produce: `invoices_immutable_after_finalize`
  (the R5 trigger from `0001_invoice_immutability.sql`) compared `NEW`/`OLD`
  as a column-tuple that included `final_check_id`, so it is redefined without
  that column in the same migration — otherwise every `UPDATE` on a finalized
  invoice would fail on a dropped column instead of the immutability check it
  exists to enforce. Seeds: `seeds/tax.ts` drops `CHECK_POLICY`; `seeds/index.ts`
  stops seeding `check_counter` and the `check.policy` setting, and
  `BRANDING_DEFAULT.receipt` drops `checkFooterLines`; `seeds/roles.ts` drops
  `check.print`/`check.reprint`/`check.void` from every role.
- **`packages/contracts`** (post-freeze change, per §0 rule 7 — recorded here
  rather than in ADR 0008): `checks.ts` deleted in full (`OrderCheckSchema`,
  `CheckEstimateEntrySchema`, `OpenCheckSchema`, `MethodMismatchSchema`).
  `enums.ts` drops `CHECK_PRINTED` from `OrderStatusSchema`/`TableStatusSchema`,
  `CheckModeSchema` entirely, and `check.print`/`check.reprint`/`check.void`
  from `PermissionSchema`. `floor.ts`'s `TableChipMoneySchema` collapses to a
  single `amount` (was `kind`/`amounts`/`assumedMethodLabel`, for the
  `SUBTOTAL_EX_TAX`/`CHECK_TOTAL` choice); `TableChipSchema` drops
  `checkOverdue`; `FloorSummarySchema` drops `openChecks`; `TableActionSchema`
  drops `PRINT_CHECK`; `summariseFloor` no longer special-cases the removed
  status. `orders.ts`'s `TrayOrderSchema` drops `checkNo`/`secondsSinceCheck`/
  `checkTotals`; `TrayCheckTotalSchema` deleted. `invoices.ts`'s `InvoiceSchema`
  drops `finalCheckId`. `reports.ts`'s `ExceptionKindSchema` drops
  `VOID_CHECK`/`CHECK_REPRINT`/`ABANDONED_CHECK`; `ShiftReportSchema` drops
  `checksPrinted`/`checkToInvoiceConversionBps`/`perCashierConversion`.
  `settings.ts` drops `CheckPolicySettingSchema` and `CHECK` from
  `SettingGroupSchema`. `sync.ts` drops `QueuedCheckSchema` and the `checks`
  field on `QueuedOrderSchema` — an offline sale now queues lines and payments
  only. `compliance.ts`'s `ComplianceDashboardSchema` drops
  `openCheckCount`/`openCheckValue` — the fifth panel's fraud signal
  (a check with no invoice behind it) has no replacement; there is no longer
  an intermediate document for one to be missing. `outlet.ts` drops
  `CHECK_MARKING`. `mocks/` updated to match throughout (`checks.ts` deleted;
  `MOCK_REFERENCE_CHECK` and everything downstream of it removed from
  `invoices.ts`, `floor.ts`, `tray.ts`, `compliance.ts`, `reports.ts`,
  `settings.ts`, `outlet.ts`, `tax.ts`).
- **`apps/pos`**: `lib/checks/` deleted in full (`actions.ts` —
  `printCheckAction`, `voidCheckAction` — `chain.ts`, `queries.ts`).
  `components/order/CheckPreviewDialog.tsx`,
  `components/receipt/CheckPrintPortal.tsx`,
  `components/receipt/CheckReceipt.tsx`, and
  `components/payment/MethodMismatchDialog.tsx` deleted outright.
  `lib/printing/documents.ts` drops `checkEscPosDocument`. `lib/tax/queries.ts`
  drops `readCheckPolicy`. `lib/floor/queries.ts` and `lib/floor/actions.ts`
  drop every `CHECK_PRINTED` list entry and the check-derived
  `checkOverdue`/`CHECK_TOTAL` branch — a table's money figure is now always
  `{ amount: subtotal }`. `lib/orders/queries.ts`'s `listTrayOrders` drops the
  whole check join and its estimate-decoding branch. `lib/payments/actions.ts`
  drops `loadCheckChain`/`finalCheckId` — finalize never depended on the
  check's own figures (it always recomputed from `order_lines`), so this is a
  pure subtraction. `lib/reports/exceptions.ts` drops
  `readVoidCheckExceptions`/`readCheckReprintExceptions`/
  `readAbandonedCheckExceptions`; `lib/reports/auditorPack.ts` drops the
  check-row count from its manifest. `lib/shifts/report.ts` drops the
  check-to-invoice conversion metric and per-cashier breakdown entirely — it
  was reusing `order_checks.printed_by` as a proxy for cashier attribution;
  no replacement metric was added, since inventing one was not part of this
  request. `lib/offline/checkNo.ts` (the `CHK-OFF-<label>-<n>` allocator) and
  its test deleted; `OfflineProvider`'s `nextOfflineCheckNo` removed;
  `buildQueuedOrder` drops the `checks` field. `app/api/sync/orders/route.ts`
  stops inserting `order_checks` rows during offline replay.
  `OrderScreen.tsx`: `handlePrintCheck`/`handleConfirmCheckPrint` deleted;
  `handleOpenPayment` no longer calls `printCheckAction` first — it just sends
  unsent lines and opens `PaymentSheet`; the `?action=check` auto-run effect
  and `initialAction`'s `'check'` value are gone (`'pay'` only); every
  `printedCheck`/`checkPrintPending`/`checkPinPromptOpen`/`offlineChecks`/
  `mismatch` piece of state and its dialogs are gone. `PaymentSheet` drops
  `checkQuotedTotal` and the method-mismatch warning; `onFinalize` no longer
  passes `totals` back up, since nothing upstream used it once the mismatch
  check was gone. `Cart.tsx` (ADR 0014, now reverted): the CASH/CARD tender
  toggle, `LiveCheckPreview`, and the Net/Tax/Grand-total block are gone —
  the footer states `Subtotal (ex tax)` and nothing else, same posture §6.9
  held before that ADR, because `PaymentSheet` already shows a live total the
  moment it opens and a second, pre-payment preview duplicated it for no
  remaining reason once printing one was no longer the point of toggling a
  tender. `TableContextSheet`/`FloorPlan`/`TableChipCard`/`TableShape` lose
  `PRINT_CHECK`, every `CHECK_PRINTED` list entry, the ageing/border treatment
  keyed on `checkOverdue`, and the open-checks summary stat.
  `ActiveOrdersTray`/`OrderCard` lose the `CHECK_PRINTED` filter and the
  check-total card face — a tray card always shows `Subtotal (ex tax)`.
  `ComplianceDashboard` loses its fifth panel (open checks) and the two
  metrics feeding it; `readComplianceDashboard` no longer takes an
  `openChecks` argument. `SettingsRegistry` loses the `CHECK` settings group.
  `BrandingEditor`'s help text stops mentioning the check. `app/admin/page.tsx`
  drops the "Open checks" and "Check to invoice" tiles. Seed role
  descriptions and mock role/permission lists updated to match
  (`packages/db/seeds/roles.ts`, `packages/contracts/mocks/outlet.ts`).
- **`packages/ui`**: `StatusPill.tsx`'s `TableState`/`TABLE_STATE_PRESETS`
  drop `CHECK_PRINTED`.

Left alone, deliberately: `PAYING` itself (a table mid-payment is still a real
state, just reached directly from `SERVED`/`ORDERED` now); `finalizeOrderAction`'s
own logic (it never read the check's figures, so it needed no change beyond
dropping the now-nonexistent `finalCheckId`); `invoices.printedCount` and the
tax-invoice print path (a fiscal document being reprinted is unrelated to the
pre-payment check this ADR removes); every "Reference Kitchens" trading name
and ordinary restaurant vocabulary in `packages/contracts/mocks` that happens
to contain the word "check" in a generic sense.

## Consequences

- Every order now goes `SERVED → PAYING (implicit) → FINALIZED` with no
  intermediate document — the tax invoice `finalizeOrderAction` writes is the
  first and only thing a customer is handed. Finalize was already the one
  place tax becomes authoritative (R9); nothing about that computation
  changed, only the step that used to precede it.
- The reprint chain, the reprint-count supervisor-PIN step-up, and the
  BOTH_RATES/ASSUMED_METHOD choice no longer exist anywhere in this codebase.
  Re-adding a pre-payment estimate document is a new feature, not a revert —
  this ADR and the deleted files' git history are the starting point, same
  posture as ADR 0018 and ADR 0015.
- The §6.13 abandoned-check compliance signal (a check open past the alert
  threshold with no invoice behind it, on the floor plan, the compliance
  dashboard, and the exceptions report) has no replacement. It was
  structurally a check-specific signal — there is no longer an intermediate
  state for a sale to go stale in before finalize, so the closest analogue
  (an order stuck at `SERVED` for a long time) is a materially weaker signal
  and was not built, since inventing a new one was not part of this request.
- `docs/BUILD-PLAN.md`'s check-related clauses and the M10 runfile are not
  rewritten — they stay an accurate record of what M10 actually built at the
  time. This ADR is what supersedes them going forward.
- The Phase-1 contract freeze (ADR 0008) is deliberately breached here, in
  the same way and for the same class of reason ADR 0015 and ADR 0018 did —
  §0 rule 7's own escape hatch is a decision record, not a silent edit, and
  this is that record.
- A migration (`0007_remove_check_printed`) drops two live tables and a
  column; there is no path back to the old data short of restoring from a
  pre-migration backup, which was accepted as the cost of "removed outright,
  not disabled."
