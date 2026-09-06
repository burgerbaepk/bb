# 0018 — remove the kitchen display product and every kitchen dependency

**Status:** accepted
**Date:** 2026-08-28
**Milestone:** post-M19 (hardening-phase request, not a numbered milestone)
**Supersedes:** M06's `kds-storefront-ui` scope (the KDS half of it),
M09a `orders-kitchen` in full, §10 "Kitchen Display" in `docs/BUILD-PLAN.md`,
and every kitchen/station field `packages/contracts` froze at the end of M06
(ADR 0008)

## Context

The product owner asked for the kitchen display system removed outright — not
disabled, not hidden behind a flag — along with every place `apps/pos`
depends on it: station routing, kitchen tickets, course firing, and the
`IN_KITCHEN` stage of the order lifecycle. This was a deliberate, tested part
of M06/M09a, not an accident; the request is a direct instruction to reverse
it, the same posture ADR 0015 records for removing TOTP.

The dependency ran deeper than `apps/kds` itself. `apps/pos` never imported
kds code directly, but the two were coupled through a shared Postgres schema
(`stations`, `kds_events`, `order_lines.kitchen_status`/`station_id`), a
shared realtime channel (`kitchen.ticketsChanged`), and — the part that
actually blocked service — an order could not reach `FINALIZED` without first
passing through `IN_KITCHEN`, a state nothing in `apps/pos` could resolve on
its own once the kitchen that was supposed to progress it was gone.

## Decision

The kitchen display product is deleted, and every field or code path that
existed only to feed it is removed rather than left dormant.

- **`apps/kds`** deleted in full (27 tracked files) — the app, its tests, its
  own `CLAUDE.md`/`AGENTS.md`.
- **`packages/domain`**: `state-machines/kitchen.ts` (`KitchenStatus`,
  `kitchenMachine`) deleted. `OrderStatus` loses `IN_KITCHEN` and `READY`
  (the latter was reachable only via the former); `orderMachine` now runs
  `DRAFT → PLACED → SERVED → CHECK_PRINTED → FINALIZED`, with `VOIDED`
  reachable from every non-terminal state, same as before.
- **`packages/contracts`** (post-freeze change, per §0 rule 7 — recorded here
  rather than in ADR 0008, which stays a record of what M06 froze):
  `kds.ts` deleted (`Ticket`, `TicketLine`, `AllDayEntry`, `StationBoard`,
  `BumpEvent`). `KitchenStatusSchema` deleted; `OrderStatusSchema` matches the
  domain machine's shrink. `OrderLineSchema` loses `stationId`,
  `kitchenStatus`, `course`, `sentAt`, `startedAt`, `readyAt`, `servedAt`.
  `OrderSchema` loses `sentToKitchenAt`. `TrayOrderSchema` loses
  `kitchenReady`/`kitchenTotal`/`kitchenOverdue`. `MenuSchema` loses
  `StationRefSchema` and the `stations` field; `Category`/`MenuItem`/
  `MenuItemDraft` lose `stationId`. `TableChipSchema` loses
  `kitchenReady`/`kitchenTotal`. `TerminalSchema` loses `printStationId`.
  `PublicOrderStatusSchema` loses per-line `ready` and `readyCount`/
  `totalCount` — there is no longer a line-level signal to derive them from,
  only the order-level `PLACED`/`SERVED`/`VOIDED` status. `QueuedLineSchema`
  (the offline replay contract, §8) loses `stationId`/`course`.
  `RoleKeySchema` loses `KITCHEN`; `PermissionSchema` loses `station.write`;
  `SettingGroupSchema` loses `KITCHEN`.
- **`packages/db`**: `schema.ts` drops `kitchenStatusEnum`, the `stations`
  table, the `kds_events` table, `orders.sent_to_kitchen_at`,
  `categories.station_id`, `menu_items.station_id`,
  `pos_terminals.print_station_id`, and `order_lines.kitchen_status`/
  `course`/`sent_at`/`started_at`/`ready_at`/`served_at`/`bumped_by`.
  `orderStatusEnum` drops `IN_KITCHEN`/`READY`. `voidReason` (already a plain
  per-line column, not kitchen-specific) is now the one signal a line is
  void — every read that used to check `kitchenStatus !== 'VOIDED'` checks
  `voidReason IS NULL` instead. Migration `0006_remove_kitchen_dependency`
  (generated, not hand-written, per R8). Seeds: `seeds/stations.ts` deleted;
  `seeds/roles.ts` drops the `KITCHEN` role and `station.write`;
  `seeds/menu.ts`/`seeds/index.ts` drop station assignment; the
  `kds.coursesEnabled` setting is no longer seeded.
- **`packages/auth`**: the `kds-station` token purpose deleted from
  `KeyPurpose`/`TokenPurpose` (`env.ts`, `tokens.ts`) — it minted the
  long-lived per-station link `apps/kds` read from a URL; nothing mints or
  verifies it now. `KITCHEN` dropped from `primaryRole`'s `ROLE_RANK`.
- **`packages/realtime`**: the `kitchen` channel (`ticketsChanged`) dropped
  from `realtimeSchema` — `floor`/`webOrders` are what remains.
- **`apps/pos`**: `sendToKitchenAction` renamed `placeOrderAction` (it still
  does the one real thing it always did — commit cart lines to a real order —
  minus the station/ticket/course machinery). `fireCourseAction` deleted.
  `lib/orders/ticket.ts`, `kitchenStatus.ts`, `transitions.ts` (and their
  tests) deleted — `nextStatusForAppend`'s job collapses to one guard:
  a second round may only append while the order is still `PLACED`.
  `components/receipt/KitchenTicketReceipt.tsx` deleted (unreferenced once
  `SentTicket`/`SentTicketLine` were removed from the action's return shape).
  `lib/stations/` (actions, queries, bands, idle) deleted in full;
  `components/admin/StationsManager.tsx` and `app/admin/stations/page.tsx`
  deleted; the admin nav entry removed. `MenuManager`/`ModifierBuilder` lose
  every station picker and the "Kitchen station" field. `TerminalsManager`
  loses the print-station picker and column. `SettingsRegistry` loses the
  `KITCHEN` settings group. `ActiveOrdersTray`'s state filter trades
  `IN_KITCHEN` for `PLACED`. `TableChipCard`/`OrderCard` lose their
  kitchen-progress badges. `cartModel.ts`'s `CartLine` loses `stationId` and
  `course`; `cartLineKey` drops the `course` argument. `lib/webOrders/actions.ts`'s
  `acceptWebOrderAction` now asserts `PLACED → SERVED` (the same edge a
  takeaway with nothing to cook already used) instead of `→ IN_KITCHEN`, and
  no longer touches `order_lines`/`kds_events`; `rejectWebOrderAction` still
  writes `voidReason`, just not `kitchenStatus`. `app/api/sync/orders/route.ts`
  (the offline-replay endpoint) stops setting `sentToKitchenAt`/`stationId`/
  `kitchenStatus`/`course` on replay. `lib/reports/sales.ts` excludes voided
  lines via `voidReason` instead of `kitchenStatus`.
- **`apps/storefront`**: `lib/orders/actions.ts` (placing a web order) stops
  writing `stationId`/`kitchenStatus`/`course` — the order lands `PLACED` and
  waits for staff, the same §13.4 "never auto-accept" gate as before, just
  with one fewer redundant signal. `lib/orders/queries.ts`'s
  `publicOrderStatus` derives `acceptedAt` from `orders.updatedAt` instead of
  the deleted `sentToKitchenAt` column. `OrderStatus`/`LiveOrderStatus` drop
  the per-line ready checkmark and the readyCount/totalCount progress line —
  the order-level status pill is the only signal left. `messages/en.json` and
  `messages/ur.json` reword `checkout.placedHelp`/`status.pending`/
  `status.accepted` away from "kitchen"/"cooking" and drop the now-unused
  `status.ready` key.
- **Root config**: `turbo.json` drops `NEXT_PUBLIC_KDS_URL` from `globalEnv`;
  `.env.example` drops the same variable and its "Copy KDS link" comment.

Left alone, deliberately: `apps/pos/components/order/DiscountDialog.tsx`'s
"Kitchen error" discount reason, `ItemOptionsSheet`'s renamed-but-still-present
per-line note field, and every "Reference Kitchen(s)" trading name in
`packages/contracts/mocks` — none of these are the kitchen _display system_;
they are ordinary restaurant vocabulary (a physical kitchen, a fictional
client's trading name) that would exist whether or not this product ever
shipped a KDS.

## Consequences

- Every order now goes `PLACED → SERVED/CHECK_PRINTED → FINALIZED` with
  nothing in between requiring a kitchen to progress it — the actual defect
  this request was raised to fix: an order could previously get stuck at
  `IN_KITCHEN` with no kitchen able to bump it forward.
- Course firing, station routing, per-station timer bands, and the bump/recall
  workflow no longer exist anywhere in this codebase. Re-adding any of them is
  a new feature, not a revert — this ADR and the deleted files' git history
  are the starting point, same posture as ADR 0015.
- `docs/BUILD-PLAN.md` §10 and the M06/M09a runfiles are not rewritten — they
  stay an accurate record of what M06/M09a actually built at the time. This
  ADR is what supersedes them going forward; a reader following §10 today
  needs to know it no longer describes a shipped product.
- The Phase-1 contract freeze (ADR 0008) is deliberately breached here, in the
  same way and for the same class of reason ADR 0015 breached it for
  `StaffMember.totpEnabled` — §0 rule 7's own escape hatch is a decision
  record, not a silent edit, and this is that record.
- A migration (`0006_remove_kitchen_dependency`) drops live columns and two
  tables; there is no path back to the old data short of restoring from a
  pre-migration backup, which was accepted as the cost of "removed outright,
  not disabled."
