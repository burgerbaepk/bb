# M03 · domain

**Milestone:** M03 · **Phase:** 0 — Foundation
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §6 in full, §2 R1/R4/R13, §3, Appendix A
**Status:** complete
**Preceding gate:** [M02](./M02-schema.md) — passed

---

## 1. Purpose

The tax engine. This is the milestone the product turns on.

Everything before it was scaffolding and storage. From here the system computes
a figure that a customer pays, that PRA and FBR are told about, and that PSTSA
s.17 makes payable to Government if it is collected in excess. A defect here is
not a rendering bug; it is a filing error repeated on every invoice until
someone notices.

It is also the only package that runs in two places. §8 requires the POS service
worker to price a check offline using this exact code, so a divergence between
client and server is a `TAX_DRIFT` report rather than a silent difference.

---

## 2. Scope

**In:** `money/` (the branded `Paisa` type, integer arithmetic,
`toFiscalDecimal`, quantity as thousandths) · `tax/` (rate resolution by service
time, the engine, the check estimator, proportional allocation, rounding, the
snapshot builder) · `pricing/` · `state-machines/` for order, table, and kitchen
(R4) · the golden fixtures.

**Out:** anything touching the database (M10 wires the engine into the finalize
transaction) · anything that renders (`Money` in `@natech/ui` is the render
boundary) · FBR payload building (M11 consumes `toFiscalDecimal` from here).

**Constraint:** `packages/domain` imports nothing from Next, React, or Drizzle
(§3), enforced by `natech/domain-purity` since M00.

---

## 3. The two documents

The rate is not known until the customer chooses how to pay: 16% on cash, 8% on
card and digital. On the Appendix A.1 order that is Rs. 977.60 on a Rs. 12,220
base. So a check printed before payment states **both** rates by default (§6.4).

The engine has two entry points that must agree:

- `estimateCheck()` — one result per rate the check will show
- `computeTotals()` — one authoritative result, from the payments actually taken

They are the same function underneath: the estimator hands `computeTotals` one
hypothetical payment per rate it wants to quote. A fixture asserts the two agree
to the paisa for all four methods, which is what makes a BOTH_RATES check
incapable of being wrong.

---

## 4. Arithmetic decisions

**Half-up means away from zero.** §6.10 says "half-up"; a credit note carries
negative amounts, and rounding −0.5 toward zero would understate every refund by
a paisa in half of cases. `divideHalfUp` is the single implementation and the
allocator shares it.

**Quantity is thousandths, held in `bigint`.** `order_lines.qty` is
`numeric(10,3)`, so 0.5 kg is 500 and the same argument that makes money integer
applies to it.

**The allocator always sums back to the total.** Every slice but one is rounded,
and the residual lands on the **largest** weight. An invoice whose parts do not
add up to its total fails §6.11 at transmission and is visible to an inspector.

**Nothing is parsed with `parseFloat`.** `parsePaisa` and `parseQty` go from
string to `bigint` directly. `"530.07"` through a float is 530.0699999999999, and
a price list is exactly where that would enter the system.

---

## 5. Gate

From §18 M03: _"70+ golden fixtures pass including byte-exact INV-20260822-11272
at 13,809.60 and its both-rates check at 13,809.60 / 14,787.20. 100% branch
coverage on `packages/domain`."_

| #   | Criterion                                         | Verified by                                 | Result                                  |
| --- | ------------------------------------------------- | ------------------------------------------- | --------------------------------------- |
| G1  | 70+ golden fixtures pass                          | domain suite                                | **PASS** — 257 tests, 48-scenario table |
| G2  | Appendix A.1 byte-exact at 13,809.60              | golden fixture                              | **PASS**                                |
| G3  | Appendix A.2 check at 13,809.60 / 14,787.20       | golden fixture                              | **PASS**                                |
| G4  | Appendix A.3 card-decline-then-cash at 14,787.20  | golden fixture                              | **PASS**                                |
| G5  | 100% branch coverage on `packages/domain`         | `vitest --coverage`                         | **PASS** — 120/120 branches             |
| G6  | Transmitted item values sum exactly to the total  | golden test (§6.11)                         | **PASS**                                |
| G7  | Every state machine rejects an illegal transition | unit tests (R4)                             | **PASS**                                |
| G8  | Workspace still green                             | typecheck, lint, test, build, gates, format | **PASS** — 12/12, 4 gates               |

Coverage is **100% on statements, branches, functions, and lines**, and the
threshold is enforced by the package's own `test` script, so CI fails on a
regression rather than reporting one.

Every §6.14 case is covered: all four payment methods, five split mixes
including the §6.6 worked example, discount before and after tax, a discount
spread across a mixed-class order, one-paisa lines either side of the rounding
boundary, three 999-quantity lines, fractional quantities, exempt and zero-rated
lines beside standard ones, both non-dine-in order types, all six
rounding mode and direction combinations, both P4 taxability flags, voided
lines, mid-service rate change in both directions, modifiers, and both check
modes.

---

## 6. Execution log

1. **Appendix A.1 reproduced byte-exact on the first run.** 12,220.00 subtotal,
   977.60 tax, 1.00 POS fee, 611.00 service charge, 13,809.60 grand total, and
   the single expected tax line. So did A.2 and A.3.

2. **Three of my own hand-computed expectations were wrong, and the fixtures
   caught them.** A mixed-class discount, a 999-unit line, and a
   several-modifier line. In each case the engine was right and my arithmetic
   was not. Each was re-derived independently before being corrected — which is
   the argument for hand-computing expectations rather than snapshotting
   whatever the code produced.

3. **Seven branches would not cover, and six of them were dead code.** `?? '0'`
   on a regex group that the pattern guarantees, `?? ZERO` on a map lookup whose
   key came from that same map, `?? 0` on an array that cannot be empty. The
   honest fix was deleting them, not writing tests that pretend they are
   reachable. Two of the seven were genuinely reachable and got tests: the
   snapshot deduplicating two payments of the same method, and the guard against
   a persisted ASSUMED_METHOD check with no method recorded.

4. **The last branch was a test that did not test what it claimed.** "Puts the
   residual on the largest weight" used weights where the residual was always
   zero, so the loop it was meant to exercise never ran. Replaced with a case
   that has one.

5. **The R1 lint rule fired on the §6.4 JSON fixture, correctly.**
   `order_checks.estimate` stores paisa as JSON integers, and `total: 1380960`
   is indistinguishable from rupees held as a float. Asserting the serialised
   string instead removes the ambiguity and pins key order as a bonus. Worth
   knowing for M11: `toFiscalDecimal(...)` is a call, not a literal, so the FBR
   payload builder will not trip this.

6. **The brand-grep STRN pattern had a false positive.** `\b[0-9]{13}\b` matched
   the 13-digit run inside `530.0699999999999` in a comment about float
   precision. Tightened with a lookbehind so a digit run preceded by a decimal
   point is not an STRN; a real one is still caught.

### Flagged for confirmation before M08

**§6.3 defines the line subtotal as `Σ(qty × unit_price) + modifier deltas`, and
that is implemented literally — the modifier delta is not multiplied by the
quantity.** Three burgers with extra cheese arguably means three portions of
cheese, and this charges for one. The reference invoice carries no modifiers so
it cannot settle the question, and quietly deviating from the written formula
would be a silent price change. A fixture pins the current behaviour so a
decision either way is a visible diff.

---

## 7. Exit

- [x] All gate criteria pass
- [x] `packages/domain` still imports no framework
- [x] Coverage threshold enforced in CI, not opt-in
- [ ] **Next: M04 · pos-ui**, which opens Phase 1 (§0 rule 4)

### Carried forward

| Item                                                                    | Milestone |
| ----------------------------------------------------------------------- | --------- |
| Modifier × quantity behaviour needs confirming                          | M08       |
| P4 — advisor opinion on service-charge and POS-fee taxability           | go-live   |
| `Money` in `@natech/ui` narrows from `bigint` to `Paisa`                | M04       |
| The engine is wired into the finalize transaction                       | M10       |
| Phase 1 begins: **data contracts freeze at the end of M06** (§0 rule 7) | M06       |
