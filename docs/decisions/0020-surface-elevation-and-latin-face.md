# 0020 — invert surface elevation, bundle a Latin face, and share one stat card

**Status:** accepted
**Date:** 2026-09-05
**Milestone:** post-M19 (design request, not a numbered milestone)
**Supersedes:** the light-mode surface values and the `soft` radius in
`docs/BUILD-PLAN.md` §14.3; nothing else. No data contract, no rule R1–R17, and
no permission behaviour changes.

## Context

The product owner asked for the back office to be brought to the visual
standard of a current shadcn-style admin dashboard: white cards on a tinted
ground, a quiet navigation rail, a consistent headline-figure card, sentence-case
table headers, and a real typeface rather than the device default.

Three things in the existing system stood between the product and that look, and
all three were structural rather than cosmetic.

**The elevation was inverted.** `--c-surface` (the page) resolved to the
operator's brand surface at 99% lightness and `--c-surface-raised` (the card) to
a flat 97%. Every card in the product therefore sat _darker_ than the page it was
on, which is the opposite of what a raised plane means. Worse, only
`--brand-surface` is ever emitted by `brandCssVariables()` (§14.3) — the raised
and sunken planes were hardcoded literals, so a rebrand moved the page and left
the cards behind.

**There was no bundled Latin face.** `--brand-font-body` was seeded as the
generic `ui-sans-serif, system-ui, sans-serif` stack, so the same screen rendered
in SF Pro on the manager's Mac, Segoe on a Windows till, and Roboto on the floor
tablet. Three devices, three products.

**Four screens had grown four private stat tiles.** `Metric` and `Mini` in the
dashboard, and byte-identical `Tile` functions in `ShiftScreen` and
`ShiftReport` — the same eight lines with four different answers to how large a
headline figure is and how muted its label is.

## Decision

**Derive the planes from the operator's one colour.** `--c-surface-raised` is now
the operator's `--brand-surface`, and the page ground and the sunken well are
`color-mix(in oklab, …)` steps away from it. The card is the operator's colour;
the page steps back from it. A rebrand moves all three together, and the mix is
done in oklab so the step is perceptually equal at any lightness. Dark mode keeps
its explicit literals — `--brand-surface-dark` is never emitted, so there is
nothing there to derive from.

**Two hover states had to move with it.** `hover:bg-surface-raised` on a
`DataTable` row and on `Button tone="ghost"` were hovers that now do nothing,
because the thing they sit on is already the raised plane. Both are
`hover:bg-surface-sunken`, which is darker than both planes and so works on
either.

**`RADIUS_REM.soft` is 0.625rem, not 0.5rem.** `--radius-sm` and `--radius-lg`
are both derived from that one value, so the whole scale moves with it; at 8px a
card and the pill inside it read as the same shape at back-office density.

**Geist is bundled and self-hosted**, from the `geist` package, for exactly the
reason Mehr Nastaliq Web is (P9, ADR 0007): a build must not depend on reaching
Google Fonts. It binds `--font-geist-sans` and `--font-geist-mono`, and the token
layer reads those **only as the fallback behind `--brand-font-*`** — an operator
who names their own face in the branding editor still wins. `next/font` mangles
the family name it registers, so the seeded brand typography references the
variable rather than the string "Geist", which would silently resolve to nothing.

**`StatCard` joins `@natech/ui`** and replaces all four private tiles. `value` is
a `ReactNode`, not a number, because R1 says money is formatted only at the
render boundary: what a caller passes is a `<Money>`, never a string it formatted
itself.

**`StatCard` has no trend or delta slot**, and this is deliberate. Nothing in the
product computes a period-over-period comparison, and a card with an empty slot
for one invites filling it with a figure that was never queried — which is the
C3/V1 defect shape R16 exists to prevent. The slot arrives when the query does.

**The back-office rail moved onto the page ground.** Elevation now means "this is
a card of content"; spending it on the chrome as well left every screen reading
as two competing panels with the actual work in the quieter one. The active nav
item is a sunken fill rather than a solid brand-primary one, and the signed-in
identity moved from the header to the foot of the rail, where it stops competing
with each page's own title. `aria-current="page"` is unchanged, and so is the
server-side permission check behind every entry (§14.1) — the rail's filtering
was and remains cosmetic.

**The dashboard's gradient hero is a plain card.** A gradient is a second thing
competing for the eye with the number printed on it.

## Consequences

- **An existing deployment keeps its old `branding` row.** `seedSettings()` is
  insert-only by design, so a database seeded before this change still carries
  the generic `ui-sans-serif` typography and will not pick up Geist until the
  row is updated — through `/admin/branding`, or by re-seeding a fresh database.
  The surface change needs no such update: it derives from the row's existing
  `theme.surface`.
- **R12 is untouched.** Every value added here is in `theme.css`, which the
  brand-grep gate already names as the one sanctioned home for a literal colour.
- **`theme.mode` remains inert.** The branding schema has carried
  `light | dark | system` since M05 and nothing has ever applied it to
  `data-theme`; dark mode still follows the OS preference alone. Wiring it would
  pin every viewer of a `light`-seeded deployment to light, which is a behaviour
  change and not this decision's to make.
- The print rules in `apps/pos/app/globals.css` now hide chrome by kind
  (`aside`, `header`) rather than by position. The structural selectors they
  replaced had to be re-derived every time the shell moved, and getting that
  wrong prints a sheet of table QR codes with a navigation menu across the top.
