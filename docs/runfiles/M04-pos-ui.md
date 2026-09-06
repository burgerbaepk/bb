# M04 · pos-ui

**Milestone:** M04 · **Phase:** 1 — Static UI on mock data
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §6.1–6.9, §8, §9, §11, §12, §14.1, §21
**Status:** complete
**Preceding gate:** [M03](./M03-domain.md) — passed

---

## 1. Purpose

Phase 1 builds every screen on mock data so the data contracts can be reviewed
before anything is wired. M04 is the till: the surfaces a cashier touches
between a customer sitting down and a customer paying.

The milestone exists to settle shape, not behaviour. What a check preview must
show, what the payment sheet needs to know, what a table chip can and cannot
display — each of those is a question about the data model, and Phase 2 is far
too late to discover that the model cannot answer one.

---

## 2. Scope

**In:** the POS shell · order grid with the §5.3 variant collapse · cart ·
check preview and print dialog · the check and tax-invoice receipt templates ·
payment sheet · split payments · method-mismatch dialog (§6.5) · discount
modal · table picker · floor plan service mode (§9.1–9.3) · active-orders tray
in both card states (§11) · web-order inbox · offline banner.

**Out:** every server action, every query, auth, printing transport. M07
onwards wires them. Nothing in this milestone writes.

**Constraint:** all data comes from `@natech/contracts/mocks`. The
`mock-data-grep` gate permits mock data only under a `mocks/` directory, so
there is exactly one place to delete when Phase 2 lands.

---

## 3. Decisions

**The tax figures on these screens are computed, not typed.** Every total the
check preview and the payment sheet render comes from `estimateCheck` and
`computeTotals` in `@natech/domain`, given mock lines. A hand-written
`13,809.60` in a mock would make the screen agree with the plan and disagree
with the engine, which is the one failure mode a static-UI milestone can
plausibly ship. It also means the Appendix A.1 order renders byte-exact on the
check preview because it is the same code path M10 will finalize through.

**`packages/contracts` holds the mock dataset.** The contracts package owns the
wire shapes; the mock dataset is the reference instance of those shapes, and
building three apps against one dataset is what proves a shape is actually
sufficient. A screen that needs a field the contract lacks fails to compile.

**Five primitives were added to `@natech/ui`.** `Button`, `SegmentedControl`,
`TextField`, `SelectField`, and `Switch`. M01 shipped the components §18 names,
and none of them is a button; three apps assembling screens without one would
have produced three button implementations and three sets of focus and RTL
behaviour. Each is exercised in `/_ds` alongside the M01 set.

**Money is absent from the cart by construction.** §6.9 allows the cart to show
`Subtotal (ex tax)` and nothing else. The cart component is not passed a tax
figure at all rather than being trusted not to render one — defect C5 is a cart
labelled `Tax (16%)` regardless of method, and the fix is that the component
has nowhere to get the number from.

---

## 4. Gate

Phase 1 gate (§18): _"every screen navigable on mock data."_ M04's share:

| #   | Criterion                                                       | Verified by                | Result   |
| --- | --------------------------------------------------------------- | -------------------------- | -------- |
| G1  | Every M04 surface is reachable by link from the POS shell       | route walk                 | **PASS** |
| G2  | The check preview renders Appendix A.2 at 13,809.60 / 14,787.20 | `receipt.test.tsx`         | **PASS** |
| G3  | The check carries `NOT A TAX INVOICE`, no QR, no fiscal number  | `receipt.test.tsx` (R17)   | **PASS** |
| G4  | Tray header count and sum derive from the rendered rows         | `tray.test.tsx` (R16)      | **PASS** |
| G5  | A table chip renders no money for `WAITER`                      | `floor.test.tsx` (§9.2)    | **PASS** |
| G6  | The cart exposes no tax figure                                  | `cart.test.tsx` (§6.9, C5) | **PASS** |
| G7  | Empty cart cannot print a check or finalize                     | `cart.test.tsx` (C1)       | **PASS** |
| G8  | Workspace green: typecheck, lint, test, build, gates, format    | `pnpm ci && pnpm build`    | **PASS** |

---

## 5. Exit

- [x] All gate criteria pass
- [x] No screen reads anything but `@natech/contracts/mocks`
- [ ] **Next: M05 · admin-ui**
