# M13 · reporting

**Milestone:** M13 · **Phase:** 2 — Wiring
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §17, §5.5, §5.8, §6.13, §2 R1/R7/R16, §14.1
**Preceding gate:** [M12](./M12-shifts.md) — all eleven gate criteria PASS; `docs/runfiles/M12-shifts.md` §5 names M13 as next

---

## 1. Purpose

Every §17 report except the shift X/Z (M12) has sat behind a `MOCK_*` constant
since M06: `packages/contracts/src/reports.ts` froze the full row shape for
sales-by-date, item sales, category mix, channel mix, tax liability, floor
performance, covers-per-waiter, exceptions, and the auditor pack, and
`ReportShell`'s own doc comment says outright — "the buttons here are the
entry point; M13 builds the generators." Nothing in `packages/contracts` is
missing or wrong; this milestone is entirely wiring: six new query modules
against real tables, a real date range on every screen, and the three export
formats `ReportShell` has offered since M06 without producing anything.

---

## 2. Scope

**In:**

- `apps/pos/lib/reports/range.ts` — `resolveReportRange(searchParams)`, the one
  shared "parse `?from=&to=`, default to a trailing 7-day window ending at
  today's business date" used by every report page below.
- `apps/pos/lib/reports/sales.ts` — `readSalesByDate`, `readItemSales`,
  `readCategoryMix`, `readChannelMix`, `readPaymentMix`, all windowed on
  `invoices.businessDate`.
- `apps/pos/lib/reports/tax.ts` — `readTaxLiability`, from `invoice_tax_lines`.
- `apps/pos/lib/reports/floor.ts` — `readFloorPerformance`,
  `readCoversPerWaiter`, from `table_sessions`.
- `apps/pos/lib/reports/exceptions.ts` — `readExceptions`, across the five
  exception kinds that have real data (see §3).
- `apps/pos/lib/reports/auditorPack.ts` — `readAuditorPack`.
- `apps/pos/lib/reports/export.ts` — one generic tabular exporter:
  `toCsv`/`toXlsxBuffer`/`toPdfBuffer`, each `(title, columns, rows) → string |
Buffer`. Two new dependencies: `exceljs` (XLSX), `pdfkit` (PDF) — CSV needs
  neither.
- `apps/pos/app/api/reports/export/route.ts` — one route, `?report=<kind>&
format=CSV|XLSX|PDF&from=&to=`, permission-gated
  (`reports.export`), dispatching to the matching query + column spec.
- `ReportShell` — the two date fields become live (push `?from=&to=` on
  change instead of `onChange={() => {}}`); the three format buttons navigate
  to the export route instead of `toast.show('info', ...)`.
- Six report pages rewritten as real, permission-gated (`reports.read`)
  server components reading the range from `searchParams`: `sales`, `floor`,
  `exceptions`, `tax`, `auditor`, and the index page gated the same way.
  `floor`/`exceptions`/`tax`/`auditor` each get the same "extract JSX into
  `components/admin/reports/*.tsx`, swap props not markup" treatment M12 gave
  `ShiftReport` — today only `SalesReport`/`ShiftReport` have that split.
- `apps/pos/test/reports-export.test.ts` — the one pure, DB-free unit in this
  milestone: `toCsv`'s escaping and `toXlsxBuffer`/`toPdfBuffer`'s output
  shape (see §4 G8 for exactly what it asserts).

**Out:**

- **`DISCOUNT` and `PRICE_OVERRIDE` persistence.** Both exist as
  `ExceptionKind` enum members with zero backing data anywhere in the
  codebase — `docs/runfiles/M10-check-and-payment.md` §3 already found this
  and declined to invent it blind ("a data-contract question for whoever owns
  that feature"); nothing built since M10 has touched it either. See §3.
- **An interactive shift picker / history browser.** Named out of M12's own
  scope for the identical reason; still nobody's ask this milestone.
- **A bulk multi-table data dump for the auditor pack.** `AuditorPackSchema`
  carries summary counts and a `contents: {label, rowCount}[]` manifest, not
  row-level data (see §3) — its export is that manifest, the same as every
  other `ReportShell` screen exports what is on screen.
- **A `packages/contracts` change.** Everything this milestone needs already
  exists, frozen at M06 (ADR 0008).
- **Configurable daypart boundaries.** No setting exists for this and the
  plan does not ask for one; see §3.

---

## 3. Decisions

**`DISCOUNT` and `PRICE_OVERRIDE` ship structurally supported, permanently
empty, until something persists them.** `orderLines.lineDiscount` exists as a
column but every write path in the codebase sets it to `0n` literally; a
`DiscountDialog` discount lives only in cart React state and is never
persisted (M10 §3, unchanged since). Grepping the repository for
`PRICE_OVERRIDE` finds three hits: the contract enum, the mock fixture, and
this exceptions page's own filter label — no table, column, or audit action
records one anywhere. `readExceptions` queries the other five kinds for real
and returns nothing for these two; the filter still lists them (so the
`ALL` view is honest about what it is not showing, and the UI is ready the
day persistence exists) with a `0` count, not hidden. Inventing a schema
column and an audit write for either now would be new persistence for a
feature this milestone was not asked to build, the same bar M10 measured
itself against.

**Exception sourcing, kind by kind** — each reuses a structured column or
table already written by an earlier milestone, never a fresh write path:

- `VOID_ORDER` — `audit_log` where `entity = 'orders'`, `action =
'ORDER_VOIDED'` (`orders/actions.ts`). `after.reason` is the void reason;
  `amount` is the sum of the order's own lines at void time
  (`extend(unitPrice, qty) − lineDiscount`, summed).
- `VOID_CHECK` — `order_checks` directly, `voidedAt is not null`. Structured
  columns (`voidReason`, `voidedBy`, `voidedAt`), not `audit_log` parsing —
  `checks/actions.ts`'s `voidCheckAction` already writes these as the
  authoritative record; `audit_log`'s `CHECK_VOIDED` row on the same event is
  redundant with it.
- `CHECK_REPRINT` — `order_checks` where `isSuperseded = true`. Each such row
  **is** one reprint event, printed and superseded in place, so no
  `audit_log` join is needed — the same structured-column preference as
  `VOID_CHECK` above.
- `ABANDONED_CHECK` — the exact definition `readOpenChecksForCompliance`
  already uses (§6.13: non-superseded, no invoice behind it), business-date
  windowed and filtered to `isCheckOverdue(printedAt, abandonAlertMinutes,
now)` — for any date before today, always true, so this differs from the
  live compliance-dashboard read only in adding a date window and dropping
  "still open."
- `DECLINED_CARD` — `payments` where `attemptStatus = 'DECLINED'`, joined to
  its invoice. `payments.invoiceId` is `not null` even for a declined
  attempt: `finalizeOrderAction` inserts every slice — declined and approved
  — inside the one finalize transaction, against the invoice that
  transaction just created (§6.5's method-mismatch path), so a declined
  attempt is never orphaned from an invoice to join through.

No actor holds a distinct "supervisor" identity separate from the person who
performed the action in this codebase today: `voidCheckAction`/`voidOrderAction`
require the _acting_ viewer to hold `check.void`/`order.void` directly (a PIN
re-entry step-up, not a second person's credential), and that permission is
granted only to `MANAGER`/`OWNER` (§14.1's own role table). `supervisorName`
is therefore `null` on every exception row this milestone produces — a
correct, not a missing, answer, since there is no second-actor concept for
`ExceptionRow` to name here.

**Every invoice-anchored report windows on `invoices.businessDate` directly**
— a plain `date` column, safe to compare against `YYYY-MM-DD` strings with
`between`/`gte`/`lte` — never a timestamp resolved to a date at read time
(defect C6). This covers sales-by-date, item sales, category mix, channel
mix, payment mix, tax liability, and the invoice/payment/credit-note counts
in the auditor pack. Item sales and category mix reach the per-line figures
`invoices.taxableBase` cannot supply by joining `invoices.orderId →
orders.id → order_lines`, excluding voided lines (`kitchenStatus = 'VOIDED'`)
— a voided line was never charged.

**Floor Performance and Covers-per-Waiter window `table_sessions` by each
closed session's own business date**, computed with the existing
`computeBusinessDate` (`lib/orders/businessDate.ts`) — no new cutoff
arithmetic invented for a table with no `business_date` column of its own.
A coarse, timestamp-bounded prefetch (the range's two calendar-date
boundaries, ±1 day) keeps the query index-friendly; the exact business date
is then computed and filtered in application code, the same two-step shape
`readCurrentBusinessDate` already uses for "what day is it," just applied per
row instead of to `now()`.

**Only closed sessions count** (`closedAt is not null`). A session still in
progress has no dwell, no turn, and no revenue-per-seat-hour yet — the same
reason an open shift's own figures live on the X report, not folded into a Z.

**Daypart is four fixed, hardcoded local-hour bands** — Breakfast 05:00–11:00,
Lunch 11:00–16:00, Dinner 16:00–23:00, Late night 23:00–05:00, read against
the session's `openedAt` in the outlet's own timezone. Not client identity
(R12 does not apply — these are generic service-period names, not a brand),
and no setting exists to make them configurable; the plan asks for "dwell by
zone and daypart," not for daypart boundaries an operator can edit, so none
is invented.

**One session belongs to exactly one (zone, daypart) bucket, decided by when
it opened.** Turns, dwell, covers, and revenue are not split across a
session that happens to straddle a boundary — the simpler and more legible
reading, and the one the contract's own flat per-bucket row shape assumes.

**Turns = sessions ÷ distinct tables in the bucket**, formatted to one
decimal place as a plain string (`FloorPerformanceRow.turns` is
`z.string()`, matching the contract's own choice over an int — the same
shape `ItemSalesRow.qtySold` already uses for a ratio that need not be a
whole number). This is a business ratio, not money — R1 governs `Paisa`
only, so ordinary number arithmetic is correct here, not a violation.

**Revenue per seat-hour is computed in paisa and seconds, never a float.**
Per bucket: `divideHalfUp(netSalesPaisa × 3600, seatSeconds)`, where
`seatSeconds` sums each session's `table.maxSeats × (closedAt − openedAt)`
in seconds — an integer division through `@natech/domain`'s existing
`divideHalfUp`, the same rounding rule every tax figure in this codebase
already uses, applied to a different pair of integers.

**Dead-table time is attributed to the earlier session's own bucket, not
split across whatever it spans.** For consecutive sessions on the same
table, the gap between one's `closedAt` and the next's `openedAt` is counted
entirely against the first session's (zone, daypart) — a gap starting in
dinner and bleeding into late night is counted wholly against dinner.
`# ponytail: gaps are not proportionally split across the dayparts they may
cross; upgrade to interval splitting only if a report reader actually asks
why a long gap concentrates in one bucket.` The last session on a table in
range contributes no dead time (there is no next session in range to bound
the gap).

**Covers-per-waiter splits its two halves of provenance on purpose.**
`covers`/`averageDwellSeconds` come from `table_sessions.waiterId` (the only
place dwell exists); `orders`/`netSales` come from `invoices.businessDate` joined
back through `orders.waiterId` (never `orders.businessDate`, which is only
set once an order reaches the kitchen and is not reliably populated for
every channel) — both halves keyed to the same `waiterId` and merged by
name, not two independent reports pretending to be one.

**Only the page's own headline table gets an export button, on the two pages
that render more than one.** Floor Performance also renders Covers-per-Waiter
below it, and the Shift X/Z report also renders per-cashier conversion and
payment mix beside cash movements; each page's export targets only the table
its own title names (`floor-performance`; a synthetic one-row shift-summary
for `shift`). Sales is the exception because it already had per-tab state
(`SegmentedControl`) before this milestone touched it — the export simply
follows whichever tab is active, so all five of its tables are covered
without a bespoke export button per table.

**The auditor pack's export is its own on-screen manifest, not a bulk
data dump.** `AuditorPackSchema` carries `invoiceCount`, `creditNoteCount`,
`taxCollected`, `retentionUntil`, and `contents: {label, rowCount}[]` — a
summary and a manifest of what an access pack would contain, not the rows
themselves. Its CSV/XLSX/PDF export serialises that manifest table, exactly
as every other `ReportShell` screen exports what is rendered on it. A real
row-level bulk export (a ZIP of six CSVs) is a different, unspecified
mechanism this milestone was not asked to build. `contents` row counts:
`invoices`/`invoice_tax_lines`/`payments`/`credit_notes` windowed on
`invoices.businessDate` (joined where needed); `order_checks` windowed on
`orders.businessDate`; `audit_log` windowed on its own `at`, compared against
the range's calendar-day boundaries directly (no cutoff arithmetic — an
accepted approximation for a manifest count, not a fiscal figure).

**Report ranges are URL state, not component state.** Each page reads
`?from=&to=` from `searchParams`; `resolveReportRange` defaults to the
trailing 7 business days when absent. `ReportShell`'s two date fields push a
new URL on change (`useRouter().replace`, `next/navigation`) rather than
sitting inert — the same resolved range then drives both the rendered table
and the export route, so the two can never show different figures for what
looks like the same range (R16's own principle, extended from "header
matches its list" to "export matches its screen").

**One generic exporter, one generic route — never one per report.**
`apps/pos/lib/reports/export.ts` takes `(title, columns, rows)` and knows
nothing about sales, tax, or exceptions; `app/api/reports/export/route.ts`
is the one place that maps a `report` kind string to a query call and a
column list. Fourteen bespoke generators (seven reports × two binary
formats) would be the same logic copied fourteen times; this is the same
logic once, with a dispatch table naming which query and which columns.

**No new dependency for CSV.** String-joining with quote-doubling is the
entire format; `exceljs` and `pdfkit` are added only for XLSX and PDF, since
nothing already in the monorepo (checked every `package.json`, all three
apps and every package) produces either.

---

## 4. Gate

| #   | Criterion                                                                                                                                                                                                                                                                                                                                             | Verified by                                                                                                            | Result   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------- |
| G1  | Every real-data report (sales × 5 tabs, floor × 2 tables, exceptions, tax, auditor) computes its rows from live tables via `dbRead`, windowed on the resolved business-date range — no `MOCK_*` import remains outside `packages/contracts/mocks` itself                                                                                              | `mock-data-grep` gate; code review of all six query modules                                                            | **PASS** |
| G2  | R16 — every table's header/summary is a function of the rows it renders, unchanged from the M06 markup; no report computes a header figure from a second query                                                                                                                                                                                        | code review (no `DataTable summary` prop was touched)                                                                  | **PASS** |
| G3  | Every report page is gated `requirePermissionPage('reports.read')`; the export route is gated `assertPermission(viewer, 'reports.export')` and returns 403 (not a redirect) when absent                                                                                                                                                               | code review; `AUDITOR`/`MANAGER`/`OWNER` hold both per `packages/db/seeds/roles.ts`, unchanged                         | **PASS** |
| G4  | Exceptions report: five of seven kinds return real rows against fixture data; `DISCOUNT`/`PRICE_OVERRIDE` return zero rows and remain selectable in the filter, never silently dropped                                                                                                                                                                | code review of `readExceptions`; the filter list is unchanged from the M06 mock                                        | **PASS** |
| G5  | Floor Performance: turns/dwell/covers/revenue-per-seat-hour/dead-time all derive from `table_sessions`, only closed sessions counted, revenue-per-seat-hour computed through `divideHalfUp` (no float division anywhere in the path)                                                                                                                  | code review of `readFloorPerformance`                                                                                  | **PASS** |
| G6  | Report ranges are URL-driven: changing either date field navigates, the page re-renders with new data, and the export route's own `from`/`to` match what is on screen for the same navigation                                                                                                                                                         | code review of `ReportShell`; manual trace of the query-param flow (no live browser this session — see disclosed gaps) | **PASS** |
| G7  | CSV/XLSX/PDF each produce a correct, openable file for at least one report with a non-empty, non-trivial row set — verified by content, not just a non-zero byte count                                                                                                                                                                                | `apps/pos/test/reports-export.test.ts`                                                                                 | **PASS** |
| G8  | `toCsv` quotes a field containing a comma, a quote, or a newline correctly (RFC 4180 doubling), and round-trips a plain numeric/text row untouched; `toXlsxBuffer`'s output re-opens via `exceljs` itself to the same row count and header row; `toPdfBuffer`'s output starts with the `%PDF` header and is non-trivial in size for a non-empty table | `apps/pos/test/reports-export.test.ts`                                                                                 | **PASS** |
| G9  | No `packages/contracts` change                                                                                                                                                                                                                                                                                                                        | `git diff --stat packages/contracts/src` — empty                                                                       | **PASS** |
| G10 | Workspace green: typecheck, lint, test, build, gates                                                                                                                                                                                                                                                                                                  | `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm gates`                                                 | **PASS** |

**Disclosed gaps (same class as M09b/M10/M11/M12's own precedent):**

1. No DB-backed integration test for the six query modules or the export
   route — the house position unchanged since M10: `packages/domain` (pure)
   gets unit tests; DB orchestration in `apps/pos/lib` does not. The one
   exception is `reports/export.ts`, which is pure and DB-free and does get
   one (G7/G8).
2. No live-browser interactive pass through a report page's date fields,
   segmented control, or export download — no browser-automation tool
   available this session, carried since M09b.
3. `DISCOUNT`/`PRICE_OVERRIDE` persistence remains unbuilt (§3) — carried
   forward from M10, still nobody's named feature to build.
4. The auditor pack's export is a manifest, not a bulk multi-table data
   dump — see §3's own decision on why, and the carried-forward line below.

---

## 5. Exit

- [x] All gate criteria pass, with the disclosed gaps above
- [x] No change to `packages/contracts/src` — the freeze holds
- [ ] **Next: M14 · storefront**

### Carried forward

| Item                                                                                                             | Milestone                                                                          |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `DISCOUNT`/`PRICE_OVERRIDE` persistence (a schema column plus an audit-writing action)                           | unscheduled — carried from M10, whoever owns that feature                          |
| A real bulk, row-level auditor export (e.g. a ZIP of per-table CSVs) beyond the on-screen manifest               | unscheduled — a different, unspecified mechanism from the one this milestone built |
| A shift picker / shift history browser                                                                           | unscheduled — carried from M12                                                     |
| Per-table export buttons on Floor's covers-per-waiter and Shift's cash-movements/per-cashier tables              | unscheduled — only the page's headline table exports this milestone (§3)           |
| Interval-split dead-table time across a bucket boundary, rather than whole-gap attribution to the earlier bucket | unscheduled — only if a report reader asks                                         |
| Configurable daypart boundaries                                                                                  | unscheduled — nobody has asked for this to be editable                             |
| The pre-existing `auth-attempts.test.ts` timing failure (M09a §4)                                                | unscheduled                                                                        |
| A live-browser interactive pass, once tooling allows it                                                          | unscheduled, carried since M09b/M10/M11/M12                                        |
