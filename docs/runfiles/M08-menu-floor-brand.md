# M08 · menu-floor-brand

**Milestone:** M08 · **Phase:** 2 — Wiring
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §5.3, §5.4, §5.5, §9.3, §9.4, §14.3,
§14.6, §2 R2/R6/R7/R8/R11/R12
**Status:** complete
**Preceding gate:** [M07](./M07-auth.md) — passed (including the post-close TOTP-enforcement
correction recorded in its §7)

---

## 1. Purpose

M04–M06 built every back-office screen against a mock viewer: `MenuManager`,
`ModifierBuilder`, `StationsManager`, `FloorEditor`, `BrandingEditor` all render,
validate, and look correct, and none of them persist anything. M08 is where that
stops being true for the shop's own configuration — the menu a cashier rings up
against, the floor a waiter seats onto, and the brand a receipt prints under —
the same way M07 was where "who is this" stopped being mock data.

It sits ahead of M09a/M09b (orders, kitchen, live floor) on purpose: an order
needs a real menu item to attach to, and a table session needs a real table to
open on. Nothing after this milestone can honestly run against fixtures.

---

## 2. Scope

**In:**

- Menu CRUD — categories, items, variants, modifier groups, modifiers, and the
  item-to-modifier-group assignment (§5.3), wired to `MenuManager` and
  `ModifierBuilder`.
- Drag-reorder persistence for categories, menu items within a category, and
  modifier groups on an item — the `sort_order` columns §5.3 and §5.4 already
  carry.
- Station CRUD (§5.4), wired to `StationsManager` — name, timer bands, printer
  station, active flag. `target < warn < overdue` validated server-side, not
  only in the form (defect V3, per the component's own doc comment).
- Floor-plan **editor** persistence (§9.4 only, not §9.3's live canvas): zones,
  tables, grid-unit geometry (`x`, `y`, `width`, `height`, `rotation`), shape,
  seat bounds, zone assignment. Wired to `FloorEditor`. The unsaved-changes
  guard the component already implements against real save/discard actions.
- Zone background upload and menu item image upload to R2 via presigned PUT,
  scoped by permission, validated by content type and size before a URL is
  minted.
- Live theme resolution and the branding editor's write path (§14.3): the
  `branding` settings key becomes real, `BrandingEditor` saves to it, and the
  root layout resolves `BrandConfig` from the database into CSS custom
  properties on every request. `packages/branding`'s own doc comment names this
  exact split — schema and variable mapping in M05, runtime resolution in M08.
- `pos_terminals` CRUD from the back office (§14.6's "terminal registration",
  carried forward from M07) — label, `pos_type`, `print_station_id`,
  active flag. `fbr_pos_id` stays null; M11 owns it.
- R7 audit rows on every mutation above; R6 soft-delete throughout — a category,
  item, station, zone, or table in use is deactivated, never hard-deleted.

**Out:**

- Anything in §9.3 (the _live_ floor canvas — SSE, table states, the context
  sheet's Seat/Open order/Transfer/Merge actions) — that is M09b.
- Station **routing** (which ticket goes to which KDS) — M09a.
- The R2-fronting image-resizing Worker serving AVIF/WebP at explicit
  dimensions (§13.5) — that is a storefront Core Web Vitals concern gated on
  M18, not a back-office CRUD concern. See the open question below.
- The receipt-logo rasterization pipeline (§15.3, satori/resvg, 1-bit PNG) —
  M15.
- Menu/floor/brand data reaching the storefront or KDS — M14 and M09a.
- A scannable QR encoder anywhere in this milestone — unrelated to M08; still
  M11.

---

## 3. Decisions (draft — open for review before implementation starts)

**Uploads go straight from the browser to R2; the app never proxies the
bytes.** A server action scoped by the same `assertPermission` +
`requireEnrolledOperator` pattern M07 established mints a presigned **POST
policy** (not a presigned PUT — built and shared as `lib/storage/r2.ts`, used
by all three upload surfaces) for a specific object key (`menu-images/<uuid>`,
`zone-backgrounds/<uuid>`, `branding/<uuid>`). A POST policy's conditions
(`content-length-range`, an exact `Content-Type` match) are enforced by R2
itself at upload time — a presigned PUT only signs a URL, and nothing in that
signature limits what gets written to it, which is what G5 needed to be true
server-side rather than merely client-declared. The browser POSTs the file
directly to R2 as `multipart/form-data`; only the resulting key — never a
URL — is written to the row (`menu_items.image_key`,
`zones.background_image_key`), matching what the frozen contracts already
carry. A Next.js server action has a request body ceiling that a proxied image
upload risks tripping, and every byte round-tripped through the app is a byte
the fixed-egress relay budget in §7.9 didn't need to spend.

**Rendering resolves a key to a URL at read time**, `${R2_PUBLIC_BASE_URL}/<key>`,
never stored as a full URL — so rotating the public custom domain is a
redeploy, not a backfill.

**"Image pipeline" resolved to the upload-and-storage half, not the resizing
Worker.** §13.5's resizing Worker (AVIF/WebP, explicit dimensions) stayed out
of scope, carried forward to M18 — see §6.

**Drag-reorder writes a full re-sequence, not a fractional index.** On drop,
the affected list's `sort_order` values are recomputed as contiguous integers
and written in one `dbWrite` transaction with one audit row for the reorder,
rather than one row and one audit entry per item. A fractional-index scheme
avoids rewriting the whole list but this repo's `sort_order` columns are
plain `int`, and a list of categories or modifier groups is never long enough
for the rewrite cost to matter.

**Floor geometry is trusted from the client only as data, not as truth.** The
editor already does all pointer-to-grid-cell math client-side (`FloorEditor`'s
own doc comment is explicit that nothing downstream should see a pixel); the
save action still re-validates every table's `x + width <= grid_cols` and
`y + height <= grid_rows` against the zone it claims, server-side, before
writing — a stale client with an old `grid_cols` must not be able to persist a
table hanging off the edge of a plan nobody can then find on the canvas.

**Branding writes are gated on `settings.write`, not a dedicated permission.**
The frozen `PermissionSchema` has no `branding.write`, and `MANAGER`'s §14.1
capability sentence never mentions branding — only `OWNER` holds
`settings.write` in the seeded roles. That makes the branding editor
`OWNER`-only by the existing contract, which is the correct scope: a rebrand
changes what a fiscal document looks like.

**Terminal registration reuses the staff-screen pattern exactly**, including
`requireEnrolledOperator()` and `assertPermission(operator, 'staff.write')` —
§14.1 doesn't name a separate permission for terminal management and
`pos_terminals` is closer kin to `users`/`roles` than to the menu or the floor.

---

## 4. What M08 found

**Three frozen-contract fields have no backing column.** `CategorySchema.slug`,
`MenuItemSchema.slug`, and `StationRefSchema.key` are all in the M06-frozen
contracts with nothing in the M02 schema to hold them — `categories`,
`menu_items`, and `stations` carry `name` and nothing else. Adding the columns
would mean a migration touching a frozen boundary from the wrong side; instead
every one is derived from `name` at read time (`lib/slug.ts`'s `slugify()` and
`screamingKey()`), the same "derived, not stored" move `initialsOf()` already
makes for a display name in `lib/auth/queries.ts`. Renaming a category changes
its slug, which is correct for something with no other identity to key on.

**`pos_terminals.print_station_id` is a `uuid`, not text.** The M08 planning
pass (this runfile's original §3) recorded it as free text, extrapolating from
`stations.printer_station_id`, which genuinely is text — a different column on
a different table. The terminals slice caught this against the real schema and
built the field as a `SelectField` sourced from `listStations()`, which is
what a uuid foreign key implies anyway.

**`TerminalSchema.fbrPosId` is a string; `pos_terminals.fbr_pos_id` is an
integer.** PRAL hands back a numeric device id (§7.3's `bposid`); the frozen
contract carries it as a string because nothing does arithmetic on it, only
prints it. Converted once at the read boundary (`lib/terminals/convert.ts`).

**"Remove" doesn't mean the same thing everywhere, and that's a real
inconsistency worth recording rather than smoothing over.** Stations and
terminals: deactivate only (`is_active` toggles, `deleted_at` stays null) —
either can be referenced by other live configuration and reactivated later,
mirroring `setActiveAction` in `lib/auth/actions/staff.ts`. Categories, menu
items, variants, modifier groups, and modifiers: a true soft delete
(`deleted_at` set), following this runfile's own G2 wording literally, and
safe because §7.6 already snapshots fiscal codes onto an order line at add
time — a later-deleted item cannot alter a transmitted invoice. Tables: soft
deleted via `saveFloorLayoutAction`'s `removedIds`, same reasoning. No data
integrity problem either way — R6 holds in both shapes — but a future
milestone touching any of these screens should not assume one "delete" means
the same operation as another's.

**`R2_PUBLIC_BASE_URL` is still the one unset storage variable.** The bucket
and its write credentials were provisioned mid-milestone (§14.6's other three
`R2_*` variables); the public custom domain (`M00-provisioning.md` §2, step 3)
was not attached. Every upload path mints a real presigned POST policy and
writes a real key on success — that half needed nothing further once the
bucket existed — but `resolveAssetUrl()` returns `null` until the base URL is
set, so an uploaded image saves correctly and renders as a placeholder. Not a
code gap; an operator step still open.

---

## 5. Gate

| #   | Criterion                                                                                                                         | Verified by                                                                                                                                                                                                                                                                                               | Result                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| G1  | Every menu/floor/station/branding mutation checks a permission server-side, not only client-side                                  | code review — every action calls `requireEnrolledOperator()` + `assertPermission()` before touching `dbWrite`                                                                                                                                                                                             | **PASS**                                                               |
| G2  | A category, item, station, zone, or table removal never hard-deletes the row                                                      | code review — see §4's note on the two shapes this takes; `db/test/constraints.test.ts` proves R6/R5 at the database layer                                                                                                                                                                                | **PASS**                                                               |
| G3  | Reordering persists and reloads in the dropped order                                                                              | `menu-logic.test.ts` (resequencing produces contiguous, gap-free `sort_order`); pointer-based drag-reorder wired in `MenuManager` for categories, items-in-category, and modifier-groups-on-item, per scope                                                                                               | **PASS**                                                               |
| G4  | A table's saved geometry never exceeds its zone's grid bounds, even from a stale client                                           | `lib/floor/bounds.test.ts`, 11 cases incl. the named "one bad table among several good ones fails the whole batch" scenario; wired into `saveFloorLayoutAction` against a fresh DB read of the zone, not the client's copy                                                                                | **PASS**                                                               |
| G5  | An uploaded image is rejected server-side outside the allowed content types and size ceiling, regardless of what the browser sent | content-type: unit-tested in each of the three upload actions (menu, floor, branding). Size ceiling: enforced by R2's own POST-policy `content-length-range` condition (`lib/storage/r2.ts`) — a storage-layer guarantee, not something a unit test without a live bucket call can independently exercise | **PASS** (content type); **construction-only** (size ceiling — see §6) |
| G6  | A presigned upload URL is scoped to one key and expires                                                                           | `lib/storage/r2.ts`: key is `${prefix}/${crypto.randomUUID()}` per call, `Expires: 300` seconds — verified by code review, not a dedicated test                                                                                                                                                           | **PASS**                                                               |
| G7  | Saved `BrandConfig` resolves into CSS custom properties on the next request with no rebuild                                       | `RootLayout` is `async` and calls `readBrandConfig()` per request (confirmed dynamic, not static, in the production build's route table); `brand-css` variables land on `<html style>`                                                                                                                    | **PASS**                                                               |
| G8  | The vendor footer line and the R12 identity fields remain impossible to edit from the branding screen                             | `lib/branding/merge.test.ts` — `SaveBrandingInput` has structurally no field that reaches `VENDOR_FOOTER_LINE`, which isn't part of `BrandConfigSchema` at all                                                                                                                                            | **PASS**                                                               |
| G9  | R7 — an audit row for every mutation in scope                                                                                     | code review — every `dbWrite` transaction across all four slices ends in a `writeAudit()` call                                                                                                                                                                                                            | **PASS**                                                               |
| G10 | `MANAGER` reaches menu/floor/station screens; only `OWNER` reaches branding                                                       | `packages/db/seeds/roles.ts` grants (unchanged by M08) plus `AdminShell`'s permission-filtered nav — no live server self-test run, same carve-out M07 recorded for its own browser path                                                                                                                   | **not verified live**                                                  |
| G11 | Workspace green: typecheck, lint, test, build, gates, format                                                                      | `pnpm run ci` (13 packages, all tests incl. `packages/db` against live Neon) and `pnpm --filter pos build` both green; `prettier --check` clean after one `--write` pass                                                                                                                                  | **PASS**                                                               |

**Not verified live:** the real R2 upload round trip end to end (browser POST
→ R2 → key persisted → image renders) — `R2_PUBLIC_BASE_URL` is still unset
(§4), so nothing can render a result even once uploaded. The write half
(presign → POST → key) is code-correct and unit-tested at the boundary; it has
not been exercised against the real bucket from a browser.

---

## 6. Exit

- [x] All gate criteria pass, except G10 and the R2 round trip within G5,
      both live-verification gaps rather than code gaps (see above)
- [x] No migration — §5.3–§5.5 tables already existed from M02; the three
      missing contract fields (§4) are derived, not added as columns
- [x] `packages/contracts` untouched — the freeze holds
- [ ] **Next: M09a · orders-kitchen**

### Carried forward

| Item                                                                                                                  | Milestone                                        |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Attach `R2_PUBLIC_BASE_URL` (the public custom domain) so an uploaded image actually renders instead of a placeholder | before M08's upload paths are useful in practice |
| Live verification of G10 (permission-gated nav/screens) and the full R2 upload round trip against a running server    | whenever a live check is next run                |
| The R2-fronting resize Worker (AVIF/WebP, explicit dimensions)                                                        | M18                                              |
| Receipt-logo rasterization pipeline                                                                                   | M15                                              |
| Live floor canvas — SSE, table states, seat/transfer/merge/split                                                      | M09b                                             |
| Station routing (which KDS a ticket reaches)                                                                          | M09a                                             |
