import { WifiOff } from 'lucide-react';
import { cn } from '../lib/cn';
import { Duration } from '../duration/Duration';

/**
 * Offline banner. BUILD-PLAN.md §8, §19.
 *
 * §8 requires a persistent banner showing queue depth and time since last sync,
 * and a blocking warning past 200 queued orders or six hours offline, while
 * still accepting orders. Refusing to take an order because the wifi dropped is
 * worse than queueing it.
 *
 * The counts are the real numbers, never a vague "offline". A cashier deciding
 * whether to keep taking orders needs to know whether two are queued or two
 * hundred.
 */
const BLOCKING_QUEUE_DEPTH = 200;
const BLOCKING_OFFLINE_SECONDS = 6 * 60 * 60;

export interface OfflineBannerProps {
  readonly queuedOrders: number;
  readonly secondsSinceLastSync: number;
  readonly className?: string | undefined;
}

export function OfflineBanner({
  queuedOrders,
  secondsSinceLastSync,
  className,
}: OfflineBannerProps) {
  const blocking =
    queuedOrders >= BLOCKING_QUEUE_DEPTH || secondsSinceLastSync >= BLOCKING_OFFLINE_SECONDS;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-2 text-sm',
        blocking
          ? 'border-danger bg-danger-soft text-danger'
          : 'border-warn bg-warn-soft text-warn',
        className,
      )}
    >
      <span className="inline-flex items-center gap-2 font-medium">
        <WifiOff aria-hidden="true" className="size-4 shrink-0" />
        Offline
      </span>
      <span>
        {queuedOrders} order{queuedOrders === 1 ? '' : 's'} queued
      </span>
      <span className="inline-flex items-center gap-1.5">
        Last sync <Duration seconds={secondsSinceLastSync} label="Time since last sync" /> ago
      </span>
      {blocking && (
        <span className="font-semibold">
          Sync as soon as a connection returns. Orders are still being accepted.
        </span>
      )}
    </div>
  );
}
