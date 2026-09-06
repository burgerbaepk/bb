# 0008 — The Phase 1 data contracts, and what freezing them means

**Status:** accepted
**Date:** 2026-08-24
**Milestone:** M06 (§0 rule 7)
**Supersedes:** nothing

## Context

§0 rule 7 says: _"Do not renegotiate a data contract after the Phase 1 freeze at
the end of M06."_ Phase 1 built every screen in the product on mock data —
M04 the till, M05 the back office, M06 the kitchen display and the storefront —
and the point of doing that before wiring anything was to find out what each
surface actually needs from the data.

## Decision

`packages/contracts/src` is frozen. It holds the wire shapes and the view models
every app renders from, and the §8 offline replay payload that the POS service
worker and `POST /api/sync/orders` must agree on exactly.

Three of the §2 rules are expressed as **absent fields** rather than as
conventions:

| Rule | Expression                                                                 |
| ---- | -------------------------------------------------------------------------- |
| R9   | No order- or line-shaped type carries a tax field (`orders.ts`)            |
| R14  | No KDS type carries a monetary field (`kds.ts`)                            |
| R17  | No check-shaped type carries a fiscal number or a QR payload (`checks.ts`) |

A rule expressed as an absent field cannot be broken by forgetting it. The
alternative — a field that must not be populated — relies on every future author
knowing why, which is the mechanism that produced defects C5, V5, and the
tax-inclusive kitchen cards in the system this replaces.

Money crosses every boundary as a **decimal string of paisa**, never a number.
`JSON.stringify(1n)` throws rather than quietly losing precision, and the §8
replay path exists precisely to reconcile a figure already printed on a customer's
check against one the server recomputes.

## Consequences

Changing a contract now means changing four apps and a service worker at once.
That is the intended cost. A change from here needs its own decision record
stating what surface required it and why the existing shape could not answer.

The mock dataset under `packages/contracts/mocks` is **not** frozen and is not
part of the contract. It is deleted as Phase 2 wiring replaces it, one milestone
at a time, and the `mock-data-grep` gate keeps it confined to that directory in
the meantime.

## Alternatives considered

**Freeze at the start of Phase 2 instead.** Rejected: the freeze exists to stop
shapes drifting under wiring work, and wiring starts at M07.

**Freeze only the sync payload.** Rejected: the view models are what four apps
compile against, and drift there produces the same rework the rule is written to
prevent.
