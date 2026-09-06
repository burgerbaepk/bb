import type { OfflineState } from '@natech/contracts';

/**
 * The offline banner's numbers — BUILD-PLAN.md §8; docs/runfiles/M16-offline.md §2.
 *
 * Pure on purpose, like `packages/db/src/orderNoLogic.ts`'s split from
 * `orderNo.ts`: `OfflineProvider` (real `navigator.onLine`, a real IndexedDB
 * queue) is the only impure half, and this is the arithmetic it hands to
 * `OfflineBanner` (`packages/ui`), which already implements the 200-order/
 * six-hour escalation itself — this function only has to report the real
 * counts, not decide when they become alarming.
 *
 * §8: "Block offline: refunds, shift close, discounts above the supervisor
 * threshold." That block is unconditional the instant the terminal is
 * offline — it is not tied to queue depth or how long the outage has run.
 */
const BLOCKED_WHILE_OFFLINE: OfflineState['blockedActions'] = [
  'REFUND',
  'SHIFT_CLOSE',
  'SUPERVISOR_DISCOUNT',
];

export interface OfflineStateInput {
  readonly online: boolean;
  readonly queuedOrders: number;
  /** When the terminal last heard back from `POST /api/sync/orders`. */
  readonly lastSyncAt: Date;
  readonly now?: Date | undefined;
}

export function computeOfflineState(input: OfflineStateInput): OfflineState {
  const now = input.now ?? new Date();
  const secondsSinceLastSync = Math.max(
    0,
    Math.floor((now.getTime() - input.lastSyncAt.getTime()) / 1000),
  );

  return {
    online: input.online,
    queuedOrders: input.queuedOrders,
    secondsSinceLastSync,
    blockedActions: input.online ? [] : BLOCKED_WHILE_OFFLINE,
  };
}
