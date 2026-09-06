'use client';

import { useState } from 'react';
import {
  Ban,
  CreditCard,
  FolderOpen,
  Merge,
  Plus,
  Split,
  Sparkles,
  Users,
  MoveRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button, Money, Sheet, StatusPill, TABLE_STATE_PRESETS, Duration, cn } from '@natech/ui';
import type { TableAction, TableChip, Viewer } from '@natech/contracts';
import { can } from '@natech/contracts';

/**
 * The table context sheet — BUILD-PLAN.md §9.3, §14.1.
 *
 * §9.3 lists the actions and adds the constraint that matters: filter by state
 * **and** permission. A waiter has no `payment.take`, so *Take payment* is not
 * offered; a `FREE` table has nothing to load. Client-side filtering is
 * cosmetic and the server checks again (§14.1), but offering an action that
 * will be refused is its own kind of defect.
 *
 * Transfer, merge, and split sit apart from the primary actions. §11.3 makes
 * the general rule explicit — a destructive or disruptive action never sits
 * adjacent to the primary one (defect V4).
 */
interface ActionSpec {
  readonly action: TableAction;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly states: readonly TableChip['status'][];
  readonly permission: Parameters<typeof can>[1];
  readonly primary: boolean;
}

const ACTIONS: readonly ActionSpec[] = [
  {
    action: 'SEAT_GUESTS',
    label: 'Seat guests',
    icon: Users,
    states: ['FREE', 'RESERVED'],
    permission: 'table.manage',
    primary: true,
  },
  {
    action: 'OPEN_ORDER',
    label: 'Open order',
    icon: Plus,
    states: ['SEATED', 'ORDERED', 'SERVED'],
    permission: 'order.create',
    primary: true,
  },
  {
    action: 'LOAD_ORDER',
    label: 'Load order',
    icon: FolderOpen,
    states: ['ORDERED', 'SERVED'],
    permission: 'order.create',
    primary: true,
  },
  {
    action: 'TAKE_PAYMENT',
    label: 'Take payment',
    icon: CreditCard,
    states: ['PAYING', 'SERVED'],
    permission: 'payment.take',
    primary: true,
  },
  {
    action: 'MARK_CLEAN',
    label: 'Mark clean',
    icon: Sparkles,
    states: ['CLEANING'],
    permission: 'table.manage',
    primary: true,
  },
  {
    action: 'TRANSFER',
    label: 'Transfer',
    icon: MoveRight,
    states: ['SEATED', 'ORDERED', 'SERVED'],
    permission: 'table.manage',
    primary: false,
  },
  {
    action: 'MERGE',
    label: 'Merge',
    icon: Merge,
    states: ['SEATED', 'ORDERED', 'FREE'],
    permission: 'table.manage',
    primary: false,
  },
  {
    action: 'SPLIT',
    label: 'Split',
    icon: Split,
    states: ['ORDERED', 'SERVED'],
    permission: 'table.manage',
    primary: false,
  },
  {
    action: 'BLOCK',
    label: 'Block table',
    icon: Ban,
    states: ['FREE', 'CLEANING', 'BLOCKED'],
    permission: 'table.manage',
    primary: false,
  },
];

export interface TableContextSheetProps {
  readonly chip: TableChip | null;
  readonly viewer: Viewer;
  /**
   * §3's decision — a merged-away table's own code, so this sheet can show a
   * reduced "merged into" view rather than the primary's full action set on
   * a table whose real order lives on a different `tableId` entirely. Comes
   * from `FloorTable.mergedIntoId`, which `TableChip` (frozen) has no room
   * for; `FloorPlan` resolves it from the table list it already holds.
   */
  readonly mergedIntoCode: string | null;
  readonly onClose: () => void;
  readonly onAction: (action: TableAction, chip: TableChip) => void;
  /** `SEAT_GUESTS` carries a guest count the other actions don't need, so it gets its own callback. */
  readonly onSeatGuests: (chip: TableChip, guestCount: number) => void;
}

export function TableContextSheet({
  chip,
  viewer,
  mergedIntoCode,
  onClose,
  onAction,
  onSeatGuests,
}: TableContextSheetProps) {
  const [seating, setSeating] = useState(false);
  const [guests, setGuests] = useState(2);
  // Reset the guest-count stepper when a different table opens — adjusted
  // during render (React's own recommended pattern for "state that resets
  // when a prop changes"), not in an effect, which would cost a second,
  // avoidable render pass for what is otherwise a synchronous derivation.
  const [seenTableId, setSeenTableId] = useState(chip?.tableId ?? null);
  if ((chip?.tableId ?? null) !== seenTableId) {
    setSeenTableId(chip?.tableId ?? null);
    setSeating(false);
    setGuests(2);
  }

  if (chip === null) {
    return <Sheet open={false} onClose={onClose} title="Table" side="bottom" />;
  }

  const preset = TABLE_STATE_PRESETS[chip.status];

  if (mergedIntoCode !== null) {
    return (
      <Sheet
        open
        onClose={onClose}
        title={`Table ${chip.code}`}
        description={`${chip.zoneName} · merged into Table ${mergedIntoCode}`}
        side="bottom"
      >
        <div className="space-y-4">
          <StatusPill
            label={preset.label}
            icon={preset.icon}
            tone={preset.tone}
            outline={preset.outline}
          />
          <p className="text-ink-muted text-sm">
            This table's guests and order are on Table {mergedIntoCode}. Splitting returns this
            table to service on its own — it does not move anything back.
          </p>
          <Button tone="secondary" icon={Split} onClick={() => onAction('SPLIT', chip)}>
            Split from Table {mergedIntoCode}
          </Button>
        </div>
      </Sheet>
    );
  }

  const available = ACTIONS.filter(
    (spec) => spec.states.includes(chip.status) && can(viewer, spec.permission),
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Table ${chip.code}`}
      description={`${chip.zoneName} · seats up to ${chip.maxSeats}`}
      side="bottom"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill
            label={preset.label}
            icon={preset.icon}
            tone={preset.tone}
            outline={preset.outline}
          />
          {chip.dwellSeconds > 0 && (
            <span className="text-ink-muted text-sm">
              Seated <Duration seconds={chip.dwellSeconds} label="Dwell" />
            </span>
          )}
          {chip.waiterInitials !== null && (
            <span className="text-ink-muted text-sm">Waiter {chip.waiterInitials}</span>
          )}
          {chip.money !== null && (
            <span className="ms-auto text-sm">
              <Money value={chip.money.amount} symbol="Rs." />
            </span>
          )}
        </div>

        {seating ? (
          <div className="border-border bg-surface-sunken space-y-3 rounded-base border p-3">
            <p className="text-sm font-semibold">Guests on Table {chip.code}</p>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: chip.maxSeats + 2 }, (_, index) => index + 1).map((count) => (
                <button
                  key={count}
                  type="button"
                  aria-pressed={guests === count}
                  onClick={() => setGuests(count)}
                  className={cn(
                    'min-h-touch min-w-touch rounded-base border text-sm tabular-nums',
                    guests === count
                      ? 'bg-primary text-primary-ink border-primary'
                      : 'bg-surface-raised border-border',
                    count > chip.maxSeats && 'border-warn text-warn',
                  )}
                >
                  {count}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setSeating(false)}>Cancel</Button>
              <Button tone="primary" onClick={() => onSeatGuests(chip, guests)}>
                Seat {guests} on Table {chip.code}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {available
                .filter((spec) => spec.primary)
                .map((spec) => (
                  <Button
                    key={spec.action}
                    tone="primary"
                    icon={spec.icon}
                    onClick={() =>
                      spec.action === 'SEAT_GUESTS' ? setSeating(true) : onAction(spec.action, chip)
                    }
                  >
                    {spec.label}
                  </Button>
                ))}
            </div>

            {available.some((spec) => !spec.primary) && (
              <div className="border-border border-t pt-3">
                <p className="text-ink-subtle mb-2 text-xs">Move or reshape this table</p>
                <div className="flex flex-wrap gap-2">
                  {available
                    .filter((spec) => !spec.primary)
                    .map((spec) => (
                      <Button
                        key={spec.action}
                        tone={spec.action === 'BLOCK' ? 'danger' : 'secondary'}
                        size="sm"
                        icon={spec.icon}
                        onClick={() => onAction(spec.action, chip)}
                      >
                        {spec.label}
                      </Button>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
