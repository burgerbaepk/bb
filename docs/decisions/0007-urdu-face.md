# ADR 0007 — the Urdu face is Mehr Nastaliq Web

**Status:** accepted · M01 · 2026-08-23 · **resolves pre-flight P9**

## Context

BUILD-PLAN P9 asked which Urdu face to ship, with Noto Nastaliq Urdu as the
default and a note that Jameel Noori Nastaleeq is what Pakistani readers expect
but is not open-licensed and needs a commercial licence check.

M01 shipped the Noto default. The owner then pointed at the vendor payroll
product, which runs its **entire** interface in Urdu rather than as a second line
under English, and has therefore had the face read in anger by real users.

That product uses Mehr Nastaliq Web.

## Decision

Ship **Mehr Nastaliq Web**, self-hosted from the `mehr` npm package, loaded
through `next/font/local`.

|                 |                                                                   |
| --------------- | ----------------------------------------------------------------- |
| Font licence    | **CC BY-SA 4.0** — commercial use permitted, attribution required |
| Package licence | MIT, covering the packaging only, not the font file               |
| Designer        | Muhammad Zeeshan Nasar, after the calligraphy of Nasrullah Mehr   |
| Style           | Lahori Nastaliq, character-based OpenType                         |
| Size            | about 132 KB TTF, 68 KB WOFF                                      |

## Why not the alternatives

**Jameel Noori Nastaleeq** is what a Pakistani reader expects, and it stays off
the table until someone buys a licence. Mehr is the closest freely licensed face
to that expectation.

**Noto Nastaliq Urdu** is licensed and would have worked, but it is larger, it
renders more slowly, and it was chosen in the plan as a safe default rather than
because anyone had read a screen set in it.

**A Naskh face** such as IBM Plex Sans Arabic is not a candidate. Naskh reads to
an Urdu speaker roughly the way a condensed grotesk reads to an English one:
legible, and not what the language is set in.

## Consequences

- **Attribution is a licence condition**, not a courtesy. Recorded in
  `THIRD-PARTY-NOTICES.md`. Do not remove it.
- **CC BY-SA share-alike applies to the font**, so a modified version of Mehr
  would have to be redistributed under the same licence. It does not reach the
  application that merely uses it. Do not modify the font file.
- **No build-time network fetch.** The face is self-hosted, so the build no
  longer depends on reaching Google Fonts. This also removes the failure mode
  M01 flagged for an offline build.
- **Four Nastaliq rules came with it**, learned from the payroll product and now
  encoded in `theme.css` and `packages/config/fonts.ts`:

  1. Mehr has **one weight**. A synthesised bold smears the outline and destroys
     the joins, so `font-synthesis: none`, and every bold utility is neutralised
     under `[lang="ur"]`. Emphasis has to come from colour or a rule.
  2. Nastaliq is **character-based**, so `ccmp`, `rlig`, and `calt` are required
     or the letters render as disconnected shapes rather than a joined line.
  3. Urdu needs **its own size scale**, not just more leading. Setting 32px where
     Latin sits at 16px puts four rows in a table laid out for fifteen. The
     working scale is in `URDU_SCALE`.
  4. Icons need `flex-shrink: 0`, because the taller Urdu line box stretches any
     flex row they sit in.

  None of these is in the build plan. Each is a visible defect if missed.
