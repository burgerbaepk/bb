# M01 · design-system

**Milestone:** M01 · **Phase:** 0 — Foundation
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §14.3, §15.2, §18 (M01), §19, P9
**Status:** complete
**Preceding gate:** [M00](./M00-foundation.md) — passed, G7 deferred

---

## 1. Purpose

Build the vocabulary every later screen is assembled from, and make several of
the §2 rules impossible to break at the component level rather than by review.

M01 is the last milestone before Phase 1 starts drawing screens on mock data. A
primitive that lets a caller render a negative duration, or a status chip that
carries meaning in colour alone, gets copied into forty screens across M04–M06
and is never fixed afterwards.

---

## 2. Scope

### In

- **Tokens** — full light and dark palettes, every value runtime-overridable from
  the `branding` settings key (§14.3), so a rebrand is a database change.
- **Type scale** and spacing, including the Urdu leading exception (§15.2).
- **Urdu face wired** — P9 resolved to Mehr Nastaliq Web, self-hosted, loaded in all three apps.
- **Components** — `Money`, `DataTable`, `Sheet`, `Dialog`, `NumericKeypad`,
  `StatusPill`, `Duration`, toast, and the four required states: empty, error,
  loading, offline (§19).
- **`/_ds` route** in `apps/pos` showing every primitive in every state, with
  light/dark and LTR/RTL toggles.
- **Component tests** for the rules a linter cannot see.

### Out

- Any data fetching. Every `/_ds` example is a literal prop.
- `next-intl` wiring and translated copy — M15.
- Screen composition — M04 onward.
- Receipt templates — they are ESC/POS and raster, not DOM (§12, §15.3).

---

## 3. Rules this milestone makes structural

| Rule  | Statement                                                       | How M01 enforces it                                                                                                                                                                      |
| ----- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1    | Money is `bigint` paisa; format only at the render boundary     | `Money` is that boundary. It takes `bigint` and formats by integer arithmetic and string padding, so no float exists in the path and it needs no exemption from `natech/no-float-money`. |
| R13   | Never render a negative duration                                | `Duration` clamps at zero internally. A caller cannot produce `-08:20` (defect V2) even by passing a negative, NaN, or −Infinity.                                                        |
| R14   | No monetary value on any KDS surface                            | `Money` emits `data-money` and `data-paisa`, so a KDS surface test asserts absence without parsing a formatted string.                                                                   |
| R15   | Every colour-coded state carries an icon and a text label       | `StatusPill` requires both as props. A colour-only chip fails to typecheck.                                                                                                              |
| R16   | Header counts and sums derive from the same query as their list | `DataTable.summary` is a function of the `rows` being rendered. There is no way to pass a precomputed total.                                                                             |
| §15.2 | RTL correctness                                                 | New rule `natech/no-physical-direction` bans `ml-`, `pr-`, `text-left`, `border-l`, and the rest in favour of logical equivalents.                                                       |

The last one is the mechanical half of the gate criterion _"RTL toggle produces
no layout breakage."_ Physical direction utilities are the only way that
breakage happens in a Tailwind codebase, so banning them at edit time is a
stronger guarantee than eyeballing the toggle once.

---

## 4. Design decisions

**`Money` takes `bigint`, not `Paisa`.** The branded `Paisa` type lands with the
tax engine in M03 (§6). A brand is a compile-time refinement of `bigint`, so
`Money` narrows to it in M03 without a signature change and without touching a
caller.

**Formatting is Western digits and Western grouping**, including in Urdu context
(§15.2), matching the reference invoice: `12,220.00`, `13,809.60`. `Money`
carries `dir="ltr"` so a figure keeps its shape inside an RTL paragraph.

**Overlays are the native `<dialog>` element.** Focus trap, Escape, inert
background, and the top layer come free, with no headless UI dependency and no
`z-index` argument. `Dialog` also has a `mandatory` mode for §6.5, where the
cashier must choose between reprinting the check and continuing at the new rate.

**Tokens resolve in three layers** — `--brand-*` (operator, injected inline in
M08), `--c-*` (resolved per theme), `--color-*` (what Tailwind exposes). The dark
palette is defined twice on purpose: once under `prefers-color-scheme` for
visitors who have expressed no preference, once under `[data-theme="dark"]` so
the `/_ds` toggle can force dark on a light machine.

---

## 5. Gate

From §18 M01: _"no hardcoded hex in source. RTL toggle produces no layout
breakage. `Duration` cannot render a negative value."_

| #   | Criterion                                           | Verified by                                    | Result                       |
| --- | --------------------------------------------------- | ---------------------------------------------- | ---------------------------- |
| G1  | No hardcoded hex in source                          | `pnpm brand-grep`                              | **PASS** — proved by fixture |
| G2  | RTL produces no layout breakage                     | `natech/no-physical-direction` + `/_ds` toggle | **PASS** — 8 forms caught    |
| G3  | `Duration` cannot render a negative value           | 12 hostile inputs                              | **PASS**                     |
| G4  | `Money` reproduces the Appendix A.1 figures exactly | unit test                                      | **PASS**                     |
| G5  | `StatusPill` cannot express colour without a label  | type test                                      | **PASS** — TS2739            |
| G6  | Every primitive renders in every state at `/_ds`    | route builds; visual review is the owner's     | **PARTIAL**                  |
| G7  | Workspace still green                               | typecheck, lint, test, build, gates, format    | **PASS** — 12/12, 82 tests   |

**G6 is partial and deliberately so.** The route builds, and every primitive is
present in every state with both toggles wired. The gate says _"UI review signed
off"_, and a visual review is not something I can perform on your behalf. Run
`pnpm --filter @natech/pos dev` and open `/_ds`.

### Gate proofs

Each failing gate was proved with a deliberate violation, observed, then removed.

**G2** — `natech/no-physical-direction` caught all eight forms in one fixture,
including a variant (`md:mr-6`) and a negative (`-ml-2`):

```
ml-4 → ms-*        pr-2 → pe-*          text-left → text-start
border-l → border-s-*   rounded-tr-lg → rounded-se-*
md:mr-6 → me-*     -ml-2 → ms-*         float-right → float-end
```

**G1** — `style={{ color: '#c81e1e' }}` in a component fails brand-grep.

**G5** — `<StatusPill tone="danger" />` fails to compile:

```
error TS2739: Type '{ tone: "danger"; }' is missing the following properties
from type 'StatusPillProps': label, icon
```

**G3** — twelve hostile inputs, including −Infinity, NaN, −0.5, and the exact
production defect (−500 seconds, which rendered as `-08:20`), all produce
`00:00`.

---

## 6. Execution log

1. **The new RTL rule caught my own `formatOverdueBy`.** It passed
   `formatDuration(elapsed - overdue)`, a raw subtraction. It was safe, because
   `formatDuration` clamps, but the rule was right to object: the clamp was two
   calls away from the subtraction. Made explicit with `Math.max(0, …)` rather
   than suppressed. A rule that only fires on other people's code is not being
   tested.

2. **`packages/ui` uses extensionless relative imports; the relay uses `.ts`.**
   Not an inconsistency: the ui package resolves as `Bundler` and its output is
   consumed by Next through `transpilePackages`, while the relay resolves as
   `NodeNext` and emits real JavaScript, which requires explicit extensions.
   Writing `.ts` specifiers in the ui package failed to compile until the
   extensions were dropped.

3. **A lucide icon is a forwardRef object, not a function.** A test asserting
   `toBeTypeOf('function')` failed for all nine table states. The render
   assertion beside it was the one that mattered.

4. **`packages/config` now ships TypeScript**, so it joined `transpilePackages`
   in all three apps and gained a real `typecheck` in place of the M00 no-op.

5. **P9 resolved after the milestone closed.** M01 shipped the plan default,
   Noto Nastaliq Urdu, over `next/font/google`. The owner then pointed at the
   vendor payroll product, which runs its whole interface in Urdu and uses Mehr
   Nastaliq Web. Switched to Mehr, self-hosted through `next/font/local`. It is
   CC BY-SA 4.0, smaller, faster, and closer to what a Pakistani reader expects,
   and it removes the build-time Google Fonts fetch. Four Nastaliq rules came
   with it that are not in the build plan and are each a visible defect if
   missed. See [ADR 0007](../decisions/0007-urdu-face.md).

---

## 7. Exit

- [x] Every mechanical gate criterion passes
- [x] G6 recorded as partial — `/_ds` builds; visual sign-off is the owner's
- [x] No regression in the M00 gates
- [x] Working tree clean
- [ ] **Next: M02 · schema.** Do not start it in this session (§0 rule 4).

### Carried forward

| Item                                                                | Milestone |
| ------------------------------------------------------------------- | --------- |
| `Money` narrows from `bigint` to the branded `Paisa`                | M03       |
| `stations.warn_seconds` band meaning is undecided (§10.3 is silent) | M09a      |
| A KDS surface test asserting no `[data-money]` node exists          | M09a      |
| `next-intl`, translated copy, and the RTL audit                     | M15       |
| P9 — resolved to Mehr Nastaliq Web (ADR 0007)                       | done      |
