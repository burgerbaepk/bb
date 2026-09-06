# M05 · admin-ui

**Milestone:** M05 · **Phase:** 1 — Static UI on mock data
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §5.10, §6.8, §6.13, §7.10, §9.4, §14, §17, §21
**Status:** complete
**Preceding gate:** [M04](./M04-pos-ui.md) — passed

---

## 1. Purpose

The back office. M04 built what a cashier touches; M05 builds what an owner,
a manager, and an auditor touch — which is a different product with different
failure modes.

A till screen is wrong for one sale. A settings screen is wrong for every sale
until somebody notices, and two of the settings here decide what a customer is
charged and what PRA is told. So the milestone is as much about how a change is
recorded as about how it is made.

---

## 2. Scope

**In:** menu manager · modifier builder · floor plan editor (§9.4) · stations
manager · staff and roles · the settings registry renderer · branding editor
(§14.3) · compliance dashboard including the §6.13 open-checks panel · every
report in §17, including both authority-facing ones.

**Out:** persistence, uploads, exports. M08, M11, M12, and M13 wire them.

---

## 3. Decisions

**The settings registry is data, not forty forms.** `settings` is a key/jsonb
table, and a table like that with a hand-built form per key drifts the first
time somebody adds a key and forgets the form. Each entry declares its type, its
group, the permission needed to write it, its audit level, and the clause it
implements; one renderer draws all of them. Adding a setting in Phase 2 is a row
in the registry, and the screen picks it up.

**A HIGH-audit change asks for a reason before it will save.** §5.10 gives
`setting_history` a `reason` column and §6.8 puts `tax.policy` and
`check.policy` at audit level HIGH. A tax-rate change with no stated reason is
the thing an inspector asks about, so the form refuses to submit without one
rather than recording an empty string.

**The compliance dashboard shows four metrics and one panel, and no more.**
§7.10 says to delete the seven-counter layout. The system this replaces reports
13,866 invoices against 20 synced, 0 pending, and 0 failed — three counters that
cannot all be true. The age of the oldest unsynced invoice is the metric that
matters because it is the one PRA would ask about.

**The floor editor keeps geometry on the logical grid.** Drag, snap, rotate in
45-degree steps, and resize all operate in grid units, never pixels (§9.3). An
unsaved-changes guard sits over the whole canvas because a floor plan is twenty
minutes of work and a browser back button.

---

## 4. Gate

| #   | Criterion                                                     | Verified by                 | Result   |
| --- | ------------------------------------------------------------- | --------------------------- | -------- |
| G1  | Every M05 surface is reachable by link from the admin shell   | route walk                  | **PASS** |
| G2  | The compliance dashboard shows exactly the four §7.10 metrics | `compliance.test.tsx`       | **PASS** |
| G3  | The open-checks panel surfaces the overdue check              | `compliance.test.tsx`       | **PASS** |
| G4  | A HIGH-audit setting cannot be saved without a reason         | `settings.test.tsx`         | **PASS** |
| G5  | Every report header count and sum derives from its rows       | `reports.test.tsx` (R16)    | **PASS** |
| G6  | Floor editor geometry stays on the logical grid               | `floor-editor.test.tsx`     | **PASS** |
| G7  | Workspace green: typecheck, lint, test, build, gates, format  | `pnpm run ci && pnpm build` | **PASS** |

---

## 5. Exit

- [x] All gate criteria pass
- [ ] **Next: M06 · kds-storefront-ui**, which closes Phase 1 and freezes the contracts
