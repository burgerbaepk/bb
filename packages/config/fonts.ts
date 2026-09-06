/**
 * Typography decisions — BUILD-PLAN.md §15.2, pre-flight P9.
 *
 * Each app calls `next/font/local` in its root layout and binds the result to
 * the CSS variable named here. This module is the decision record and the
 * single source for those variable names.
 */

/**
 * P9 — RESOLVED. The Urdu face is **Mehr Nastaliq Web**.
 *
 * The plan's default was Noto Nastaliq Urdu, with Jameel Noori Nastaleeq noted
 * as what Pakistani readers actually expect but blocked on a commercial licence
 * check. Mehr is the third option and it is better than either:
 *
 *   - **Licensed for this use.** The font is CC BY-SA 4.0, which permits
 *     commercial use with attribution. The npm package that carries it is MIT,
 *     but that MIT covers the packaging only — the font file has its own terms,
 *     and those terms are the CC licence. Attribution is recorded in
 *     `docs/decisions/0007-urdu-face.md` and `THIRD-PARTY-NOTICES.md`.
 *   - **Genuine Nastaliq, and Lahori.** Not Naskh. Naskh reads to an Urdu
 *     speaker roughly the way a condensed grotesk reads to an English one:
 *     legible, but not what the language is set in.
 *   - **Small and fast.** About 132 KB as TTF, 68 KB as WOFF, with reduced line
 *     height compared with other Nastaliq faces. That matters on a four-year-old
 *     Android tablet, which is the M18 performance target.
 *   - **Self-hosted.** No Google Fonts fetch during the build, so a build does
 *     not depend on reaching a third party.
 *
 * Already in production in the vendor's payroll product, where Urdu is the whole
 * interface rather than a second line, so the face has been read in anger.
 */
export const URDU_FONT = {
  family: 'Mehr Nastaliq Web',
  package: 'mehr',
  packageVersion: '2.0.1',
  file: 'mehr.woff',
  fontLicence: 'CC BY-SA 4.0',
  packageLicence: 'MIT (packaging only)',
  designer: 'Muhammad Zeeshan Nasar, after the calligraphy of Nasrullah Mehr',
  style: 'Lahori Nastaliq',
  preflight: 'P9 — resolved',
} as const;

/**
 * CSS custom properties the loaders bind to. These are the `--brand-font-*`
 * names the token layer reads, so a loaded font overrides the token default by
 * the same mechanism the branding layer uses (§14.3).
 */
export const FONT_VARIABLES = {
  display: '--brand-font-display',
  body: '--brand-font-body',
  mono: '--brand-font-mono',
  urdu: '--brand-font-urdu',
} as const;

/**
 * §15.2 Nastaliq rules, encoded so they can be asserted rather than remembered.
 * Applied in `theme.css` on `[lang="ur"]`.
 *
 * Four of these are not in the plan. They come from running a full Nastaliq
 * interface in production:
 *
 *   `hasBoldCut: false` — Mehr has one weight. A browser asked for bold
 *     synthesises it by smearing the outline, which on joined Nastaliq strokes
 *     destroys the joins. `font-synthesis: none` blocks that, and emphasis has
 *     to come from colour or the surrounding rule instead of weight.
 *
 *   `requiredFeatures` — Nastaliq is character-based rather than glyph-based, so
 *     without `ccmp`, `rlig`, and `calt` the letters render as disconnected
 *     shapes rather than a joined line.
 *
 *   `needsOwnSizeScale` — more leading alone is not enough. Nastaliq needs more
 *     size too, but naively setting 32px where Latin sits at 16px puts four rows
 *     in a table built for fifteen. The scale below is the one that keeps the
 *     proportions without destroying density.
 *
 *   `iconsNeedFlexShrinkZero` — the taller Urdu line box stretches any flex row
 *     an icon sits in unless the icon is pinned.
 */
export const URDU_TYPOGRAPHY = {
  minimumBodyPx: 18,
  hasBoldCut: false,
  requiredFeatures: ['ccmp', 'rlig', 'calt', 'liga', 'kern'] as const,
  needsOwnSizeScale: true,
  iconsNeedFlexShrinkZero: true,
  allowUppercase: false,
  allowLetterSpacing: false,
  allowCondensed: false,
  /** Money is Western digits in every locale (§15.2), so screen matches paper. */
  digits: 'western',
} as const;

/**
 * The Urdu size scale, in rem, for a document whose language is Urdu. Pairs of
 * [font-size, line-height]. Used by the storefront in M15; the POS and admin
 * stay English (§15.1) and never load it.
 */
export const URDU_SCALE = {
  xs: [1.125, 1.875],
  sm: [1.25, 2.125],
  base: [1.5, 2.5],
  lg: [1.75, 2.75],
  xl: [2.25, 3.25],
  '2xl': [3, 4.25],
} as const;
