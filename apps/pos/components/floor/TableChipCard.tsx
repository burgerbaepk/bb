import { Money, StatusPill, TABLE_STATE_PRESETS, Duration, cn } from '@natech/ui';
import type { TableChip } from '@natech/contracts';

/**
 * The table chip — BUILD-PLAN.md §9.2, §6.9.
 *
 * ```
 * ┌──────────────┐
 * │  17      ●●●●│  code · occupancy dots
 * │  Ordered     │  state icon
 * │  24:10   AK  │  dwell timer · waiter initials
 * │  Rs. 7,310   │  subtotal ex tax
 * └──────────────┘
 * ```
 *
 * The money row is **omitted entirely** when `chip.money` is null, which is how
 * §9.2 says to treat a `WAITER` — not blurred, not zeroed, absent. The contract
 * makes that expressible: a waiter's chip has no figure to render rather than a
 * figure the component declines to draw.
 *
 * ADR 0019 — the figure is always `Subtotal (ex tax)` (§6.9): the real total
 * is not knowable until the customer pays.
 */
export interface TableChipCardProps {
  readonly chip: TableChip;
  readonly onOpen: (tableId: string) => void;
  readonly className?: string | undefined;
}

export function TableChipCard({ chip, onOpen, className }: TableChipCardProps) {
  const preset = TABLE_STATE_PRESETS[chip.status];

  return (
    <button
      type="button"
      onClick={() => onOpen(chip.tableId)}
      className={cn(
        'border-border bg-surface-raised flex w-full flex-col gap-1.5 rounded-base border p-3 text-start',
        className,
      )}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="text-lg font-semibold tabular-nums">{chip.code}</span>
        <OccupancyDots seated={chip.seatedCount} capacity={chip.maxSeats} />
      </span>

      <span className="flex w-full flex-wrap items-center gap-1.5">
        <StatusPill
          size="sm"
          label={preset.label}
          icon={preset.icon}
          tone={preset.tone}
          outline={preset.outline}
        />
      </span>

      <span className="text-ink-muted flex w-full items-center justify-between gap-2 text-xs">
        {chip.dwellSeconds > 0 ? (
          <Duration seconds={chip.dwellSeconds} label={`Dwell on table ${chip.code}`} />
        ) : (
          <span>{chip.zoneName}</span>
        )}
        {chip.waiterInitials !== null && <span className="font-medium">{chip.waiterInitials}</span>}
      </span>

      {chip.money !== null && (
        <span className="w-full text-sm">
          <Money value={chip.money.amount} trimWholeRupees />
          <span className="text-ink-subtle ms-1.5 text-2xs">ex tax</span>
        </span>
      )}
    </button>
  );
}

/** Occupancy against capacity. Capacity is P8 and currently a default. */
function OccupancyDots({
  seated,
  capacity,
}: {
  readonly seated: number;
  readonly capacity: number;
}) {
  return (
    <span
      className="flex gap-0.5"
      aria-label={`${seated} of ${capacity} seats occupied`}
      role="img"
    >
      {Array.from({ length: capacity }, (_, index) => (
        <span
          key={index}
          className={cn('size-1.5 rounded-full', index < seated ? 'bg-ink' : 'bg-border-strong')}
        />
      ))}
    </span>
  );
}
