# M15 · urdu

**Milestone:** M15 · **Phase:** 2 — Wiring
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §15, §7.9, §2 R1/R12, §14.1
**Preceding gate:** [M14](./M14-storefront.md) — all eleven gate criteria PASS; `docs/runfiles/M14-storefront.md` §5 names M15 as next

---

## 1. Purpose

§15 splits Urdu support four ways: the storefront gets full localisation, the
check and tax invoice get a bilingual toggle, menu data carries a second
language, and the KDS shows bilingual line names. Three of those four already
exist in some form from earlier milestones — M02/M06 already put `name_ur`/
`description_ur` on every menu table and in `packages/contracts`, M06 already
renders the storefront bilingually through a hand-rolled dictionary context
that names its own successor ("§15 assigns `next-intl` to M15 ... M15 replaces
it"), and the KDS already renders `nameUr` end to end. What does not exist yet:
`next-intl` itself (the storefront's locale flips client-side only, so the
first paint is always English/LTR — a real defect, not just a missing
dependency), bilingual _line items_ on a receipt (today `showUrdu` only adds
one static banner sentence), and the entire ESC/POS rasterisation pipeline —
`tooling/print-bridge/src/escpos.ts`'s own doc comment has said "that is
M15's" since M10.

---

## 2. Scope

**In:**

- **Storefront localisation, real**: `next-intl` replaces
  `apps/storefront/components/i18n.tsx`. Locale is read from a cookie
  server-side on every request, so `<html lang dir>` is correct at first
  paint — fixing the always-English/LTR SSR gap the current
  `useEffect`-driven flip leaves. Strings move from the two dictionaries into
  `messages/en.json`/`messages/ur.json`. `pick(english, urdu)` — the
  DB-field bilingual selector, distinct from a translated UI string — survives
  as a small hook layered on `next-intl`'s own `useLocale()`.
- **RTL audit**: confirmed clean (§3) — the storefront already uses logical
  Tailwind utilities throughout (`ps-*`/`pe-*` etc., the M01 design-system
  rule); no physical-direction class exists anywhere under
  `apps/storefront/components` or `app`. Re-verified after every file this
  milestone touches.
- **Bilingual menu data**: no schema or contract change — `name_ur`/
  `description_ur` have existed since M02/M06. This milestone's job is
  narrower: carry `nameUr` the rest of the way, onto a printed receipt, which
  it does not reach today (see next point).
- **Check and tax invoice, real bilingual line items**: `CheckReceipt`/
  `TaxInvoiceReceipt` show each item's Urdu name (from `nameUrSnapshot`) under
  the English one when `receipt.showUrdu` is on and the snapshot is not null —
  not just the existing static banner, which stays. `CheckPrintPortal`/
  `TaxInvoicePrintPortal` gain the `showUrdu` prop they are missing today (a
  pre-existing gap: `OrderScreen` never passes it, so the HTML print path has
  never actually shown the banner).
- **ESC/POS rasterisation (§15.3)**: `@natech/print-bridge` gains a raster
  pipeline — `satori` lays out Urdu text, `@resvg/resvg-js` rasterises it to
  RGBA, a 1-bit threshold (no dither) packs it for `GS v 0`, `@upstash/redis`
  (the same client shape `packages/realtime` already uses) caches the packed
  bitmap by content hash. `EscPosDocument`/`buildEscPosBuffer` gain a raster
  line kind and go async; `checkEscPosDocument`/`invoiceEscPosDocument` emit a
  paired Urdu raster line under each item name and interleave it into the one
  buffer, per the §15.3 diagram, before it ever reaches the print bridge
  agent's unchanged `POST /print {bufferBase64}` contract.
- **`logoReceipt` through the same pipeline** (§15.3's last line): the raster
  core is input-agnostic (SVG in, packed 1-bit bitmap out), so the outlet's
  receipt logo — never printed on the ESC/POS path today — gets a thin
  adapter that wraps the fetched image in a one-`<image>` SVG and runs it
  through the same rasterise-and-cache function. Silently skipped when
  `logoReceiptUrl` is empty or the fetch fails; a receipt must still print.
- Both server actions that build an ESC/POS buffer today
  (`printCheckAction`, `finalizeOrderAction`) read `receipt.showUrdu` from
  `readBrandConfig()` themselves, server-side, rather than trust a client
  flag — the same posture `readCheckPolicy`/`readTaxPolicy` already establish
  in the same functions.

**Out:**

- **Locale-prefixed routing / hreflang SEO.** The plan asks for "full
  localisation," not a second indexed URL tree. A cookie-based locale with no
  `[locale]` segment and no `middleware.ts` keeps every canonical URL, the
  sitemap, and the JSON-LD M14 just built completely unchanged — see §3 on
  why this also keeps ADR 0010's territory untouched. Carried forward as an
  option, not a gap: nothing here blocks adding it later.
- **KDS changes.** Already bilingual end to end since an earlier milestone
  (`Ticket.tsx`, `board.ts`, `status.ts` all already carry `nameUr`). Audited,
  confirmed, untouched.
- **Credit-note bilingual ESC/POS.** §15.1's table names the check and the tax
  invoice only. `apps/pos/lib/credits/documents.ts` stays English-only.
- **A DB-backed integration test for the new server-action wiring**, or a
  live print against physical hardware — unchanged house position since M10.
- **A live-browser interactive pass** through the storefront language
  switcher, and no font-rendering pixel-diff test against real Nastaliq
  output — no browser-automation tool this session, the same disclosed gap
  carried since M09b.
- **A `packages/contracts` change.** `nameUr`/`nameUrSnapshot`/`descriptionUr`
  already exist everywhere needed; this milestone only reaches code that was
  not yet reading them.

---

## 3. Decisions

**No `middleware.ts`, no `[locale]` route segment.** `next-intl` supports
"localisation without routing" — locale resolved from a cookie, read in
`getRequestConfig`, no URL change — and that is what ships. Two reasons: M14
spent a whole milestone getting the storefront's canonical URLs, sitemap, and
JSON-LD right for one URL per page, and a `[locale]` prefix would restructure
all of it for a requirement (§15) that never actually asks for two indexed
language trees. And while ADR 0010 is scoped to _authorisation_ in middleware,
not middleware as such, the storefront currently runs without one; adding a
`middleware.ts` whose only job is a locale rewrite is still a second place
that runs on every request for a saving nothing here needs. Reusing the same
"no middleware" shape keeps the whole product on one request-handling model
rather than carving out an exception for the one app that happens not to gate
on auth.

**The rasteriser lives in `@natech/print-bridge`, executes in `apps/pos`'s
server actions.** §7.9 says the print bridge agent "hosts" the Urdu raster
pipeline; §15.3's own diagram draws the render step _before_ "→ print bridge
agent," and says "render server-side," where "server-side" is contrasted with
the browser, not with the Next.js server. Both are satisfied by putting the
code in the `@natech/print-bridge` package — which is not the same thing as
the print-bridge _process_ — and calling it from `printCheckAction`/
`finalizeOrderAction`, exactly where `buildEscPosBuffer` is already called
today. The finished buffer, raster blocks and all, crosses to the till over
the existing, unchanged `POST /print {bufferBase64}` contract; the local
agent stays a dumb pipe to the printer, which is what it already is for the
WebUSB path and keeps satori/resvg's native binaries off a device that is
sometimes a four-year-old Android tablet (§18 M18's own target hardware).

**`OrderLine`/`LineModifier` in `packages/domain` gain an optional `nameUr`
field, populated by `toDomainLines`.** `PricedLine.line` already carries the
whole input `OrderLine` through untouched; adding one nullable string field is
pure data, changes no pricing logic, and lets `CheckReceipt`/
`TaxInvoiceReceipt`/`documents.ts` reach the Urdu name through the one path
that already threads a line from `Order` to a rendered receipt, rather than a
second lookup keyed by line id.

**`checkEscPosDocument`/`invoiceEscPosDocument` take a small `receipt: {
showUrdu, logoReceiptUrl }` argument, not a full `BrandConfig`.** Keeps the
print-document builders' API surface to exactly the two fields they need
instead of coupling them to `@natech/branding`'s whole shape.

**`receipt.showUrdu` stays sourced from `BrandConfig`, read via the existing
`readBrandConfig()`.** The parallel `SettingDefinitionSchema` mock-registry
entry for the same key (`packages/contracts/mocks/settings.ts`) is Phase-1
scaffolding that was never wired to a reader — `BrandingEditor` already owns
the live UI and write path for this flag. Left alone; not this milestone's
freeze to renegotiate.

---

## 4. Gate

| #   | Criterion                                                                                                                                                                                                                                                                                                                                                                                                                                | Verified by                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Result   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| G1  | `next-intl` replaces `LocaleProvider`; locale resolved server-side from a cookie (`i18n/request.ts`); `<html lang dir>` is correct on first render, not flipped client-side after hydration                                                                                                                                                                                                                                              | code review of `app/layout.tsx`/`i18n/request.ts`; `test/i18n.test.ts`'s `resolveLocale` coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | **PASS** |
| G2  | RTL audit — no physical-direction Tailwind utility (`pl-`/`pr-`/`ml-`/`mr-`/`left-`/`right-`/`rounded-l-`/`rounded-r-`/`border-l-`/`border-r-`/`text-left`/`text-right`) anywhere under `apps/storefront`                                                                                                                                                                                                                                | repo-wide grep, re-run after every edit this milestone made — zero matches                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | **PASS** |
| G3  | Bilingual menu data (`nameUr`/`descriptionUr`) still reaches the storefront UI through `usePick()`, the same data path M06 established, now driven by `next-intl`'s `useLocale()` instead of the retired context                                                                                                                                                                                                                         | code review of `MenuBrowser`/`ItemDetail`/`OrderStatus`/`CheckoutFlow`; `storefront.test.tsx`'s "renders the Urdu name of an item"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | **PASS** |
| G4  | Check and tax invoice HTML receipts show each item's own Urdu name under the English one when `showUrdu` is on and `nameUr`/`nameUrSnapshot` is not null — not only the pre-existing static banner; `CheckPreviewDialog`/`CheckPrintPortal`/`TaxInvoicePrintPortal`/`FinalizedDialog` all actually receive and pass `showUrdu` (previously dropped silently — `CheckPrintPortal`/`TaxInvoicePrintPortal` never received the prop at all) | code review of `CheckReceipt.tsx`/`TaxInvoiceReceipt.tsx` and every call site in `OrderScreen.tsx`/`CheckPreviewDialog.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | **PASS** |
| G5  | ESC/POS: a Urdu line rasterises through `satori` + `@resvg/resvg-js` to a 1-bit, no-dither bitmap at 384 dots, cached in Redis by content hash, and interleaves into the same buffer as a `GS v 0` block, in print order, alongside the English text commands — the print bridge agent's `POST /print {bufferBase64}` contract is unchanged                                                                                              | `tooling/print-bridge/test/raster.test.ts` (real satori/resvg/font rendering, no network) — GS v 0 header byte-exact against the bitmap's own dimensions; code review of `documents.ts`'s interleaving                                                                                                                                                                                                                                                                                                                                                                                                                                | **PASS** |
| G6  | The outlet's receipt logo routes through the same rasterise-and-cache pipeline for the ESC/POS path (never printed there before this milestone); a missing URL, a failed fetch, or a non-PNG logo all degrade to no logo, never a broken receipt                                                                                                                                                                                         | `raster.test.ts`'s PNG-decode and non-PNG-returns-null cases; code review of `logoLines()`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | **PASS** |
| G7  | `receipt.showUrdu` and the logo URL are read server-side (`readBrandConfig()`) inside `printCheckAction`/`finalizeOrderAction` themselves, not trusted from the client — the same posture `readCheckPolicy`/`readTaxPolicy` already hold in the same functions                                                                                                                                                                           | code review                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | **PASS** |
| G8  | KDS bilingual line names — audited, already complete from an earlier milestone, no changes needed                                                                                                                                                                                                                                                                                                                                        | code review of `apps/kds/components/Ticket.tsx`, `lib/kitchen/board.ts`, `lib/kitchen/status.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | **PASS** |
| G9  | No `packages/contracts` change                                                                                                                                                                                                                                                                                                                                                                                                           | `git diff --stat packages/contracts/src` — empty (`packages/contracts/mocks/orders.ts`, not frozen, is the only contracts-package file touched)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | **PASS** |
| G10 | Workspace green: typecheck (all 15 packages), lint (all 15), test, build (`pos`, `storefront`, `kds`, `print-bridge`, `fiscal-relay`), all four `pnpm gates`                                                                                                                                                                                                                                                                             | `pnpm run ci` — every package typechecks and lints clean; `@natech/pos` 182/182, `@natech/storefront` 21/21 (19 pre-existing + `i18n.test.ts`'s 2), `@natech/print-bridge` 10/10 (4 pre-existing + `raster.test.ts`'s 6, real rendering, no mocks), `@natech/domain`/`@natech/contracts`/`@natech/kds`/every other package green; `packages/db`'s pre-existing `auth-attempts.test.ts` timing flake is the sole failure, carried since M09a and named in M14's own gate table as unrelated; `pnpm build` succeeds for all five buildable targets; `pnpm gates` (brand-grep, mock-data-grep, tax-column-grep, migration-diff) all pass | **PASS** |

**Disclosed gaps (same class as every milestone since M09b):**

1. No DB-backed integration test for `printCheckAction`/`finalizeOrderAction`'s
   new branding-config read, and no live print against physical hardware — the
   rasteriser itself is tested for real (fonts, satori, resvg all run), but the
   ESC/POS byte stream has never touched a thermal printer. Unchanged house
   position since M10.
2. No live-browser interactive pass through the storefront language switch,
   and no pixel-diff of rendered Nastaliq against a reference — no
   browser-automation tool this session, carried since M09b.
3. Locale-prefixed routing and hreflang SEO are not built — a deliberate
   scope decision (§3), not a gap: nothing here blocks adding it later.
4. `apps/storefront`'s root layout already called a dynamic API
   (`currentCustomerSession()`'s cookie read, M14) before this milestone —
   every route was already excluded from static/ISR rendering regardless of
   `getLocale()`'s own cookie read. `/menu`'s `revalidate = 300` (M14) has
   therefore not taken effect since at least M14; this milestone did not
   introduce that, and fixing it is a Core Web Vitals question for M18, not
   §15's.
5. The pre-existing `auth-attempts.test.ts` timing failure (M09a §4) — untouched, still carried.

---

## 5. Exit

- [x] All gate criteria pass, with the disclosed gaps above
- [x] No change to `packages/contracts/src` — the freeze holds
- [ ] **Next: M16 · offline**

### Carried forward

| Item                                                                                                                   | Milestone                                                |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Resend webhooks — bounce/complaint tracking and an admin surface for it                                                | unscheduled                                              |
| A dedicated Cloudflare Worker resizing R2 images                                                                       | unscheduled — needs real infra provisioning              |
| `RealtimeProvider`, retiring the raw-`EventSource` workaround in all three apps at once                                | unscheduled — carried since M09a/M09b                    |
| A live-browser interactive pass and a real Lighthouse/CWV run, once tooling allows it                                  | unscheduled, carried since M09b                          |
| The pre-existing `auth-attempts.test.ts` timing failure (M09a §4)                                                      | unscheduled                                              |
| A thumbnail on `MenuBrowser`'s list rows                                                                               | unscheduled, carried since M14                           |
| Locale-prefixed routing/hreflang, if a second indexed language tree is ever wanted                                     | unscheduled — deliberately out (§2/§3)                   |
| A live print of a rasterised Urdu receipt against real ESC/POS hardware                                                | unscheduled — no hardware this session                   |
| The storefront root layout's pre-existing loss of static/ISR rendering (`currentCustomerSession()`'s cookie read, M14) | unscheduled — an M18 Core Web Vitals question, not M15's |
