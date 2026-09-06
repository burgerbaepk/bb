/**
 * @natech/contracts — the shapes every surface agrees on.
 *
 * BUILD-PLAN.md §3, §8, §0 rule 7.
 *
 * Two jobs. The first is the one §3 names: the POS service worker and
 * `POST /api/sync/orders` must agree on the wire shape of a queued order
 * exactly, or a replay is rejected after the sale has already completed on the
 * terminal (§8, `sync.ts`).
 *
 * The second is what Phase 1 was for. M04, M05, and M06 built every screen
 * against these types, so a surface needing a field the contract lacks failed to
 * compile rather than being discovered during wiring.
 *
 * **FROZEN at the end of M06** (§0 rule 7), with two deliberate exceptions:
 * ADR 0018 removed the kitchen display product entirely (`kds.ts` and every
 * kitchen/station field this file used to carry), and ADR 0019 removed the
 * printed check (`checks.ts` in full, plus every check-shaped field the
 * surviving files carried) — the plan's own §0 rule 7 treats both as exactly
 * the kind of change that needs a decision record, not a commit; see those
 * ADRs for why the freeze does not block them.
 *
 * One rule is structural here rather than advisory, in the same way R1 and
 * R13 are structural in `@natech/ui`:
 *
 *   R9   No order- or line-shaped type carries a tax field (`orders.ts`).
 *
 * A rule expressed as an absent field cannot be broken by forgetting it.
 */

export {
  PaisaSchema,
  PaisaWireSchema,
  QtySchema,
  QtyWireSchema,
  RateBpsSchema,
  InstantSchema,
  BusinessDateSchema,
  toPaisaWire,
  toQtyWire,
} from './money';

export * from './enums';
export * from './menu';
export * from './floor';
export * from './orders';
export * from './invoices';
export * from './outlet';
export * from './staff';
export * from './settings';
export * from './storefront';
export * from './reports';
export * from './sync';
