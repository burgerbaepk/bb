'use client';

import { useState } from 'react';
import { Button, SegmentedControl, Sheet, StatusPill, TABLE_STATE_PRESETS, cn } from '@natech/ui';
import type { FloorTable, Zone } from '@natech/contracts';

/**
 * Choose a table — BUILD-PLAN.md §5.5, §9.1, §9.2, defect V9.
 *
 * Zone first, then code. The system this replaces encodes the zone inside the
 * table name as `1 B`, `1 BU`, `1 F` (defect V9), which makes a picker either a
 * long flat list or a string-parsing exercise.
 *
 * Every table shows its state as icon plus label, not colour (R15), and its
 * capacity, because seating six at a two-top is the mistake this screen exists
 * to prevent.
 */
export interface TablePickerSheetProps {
  readonly open: boolean;
  readonly zones: readonly Zone[];
  readonly tables: readonly FloorTable[];
  readonly selectedTableId: string | null;
  readonly onClose: () => void;
  readonly onSelect: (table: FloorTable, guestCount: number) => void;
}

export function TablePickerSheet({
  open,
  zones,
  tables,
  selectedTableId,
  onClose,
  onSelect,
}: TablePickerSheetProps) {
  const [zoneId, setZoneId] = useState<string>(zones[0]?.id ?? '');
  const [pending, setPending] = useState<FloorTable | null>(null);
  const [guests, setGuests] = useState(2);

  const zoneTables = tables.filter((table) => table.zoneId === zoneId);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={selectedTableId === null ? 'Choose a table' : 'Change table'}
      description="Choose an available table that fits the party. Running dine-in orders are moved immediately."
      side="inline-start"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={pending === null}
            onClick={() => {
              if (pending !== null) onSelect(pending, guests);
              onClose();
            }}
          >
            Seat {guests} on {pending?.code ?? '—'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <SegmentedControl
          label="Zone"
          value={zoneId}
          onChange={setZoneId}
          options={zones.map((zone) => ({
            value: zone.id,
            label: zone.name,
            count: tables.filter((table) => table.zoneId === zone.id).length,
          }))}
        />

        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {zoneTables.map((table) => {
            const preset = TABLE_STATE_PRESETS[table.status];
            const selected = pending?.id === table.id || selectedTableId === table.id;
            const available = table.status === 'FREE' || table.status === 'RESERVED';
            const selectable = available || table.id === selectedTableId;
            return (
              <li key={table.id}>
                <button
                  type="button"
                  disabled={!selectable}
                  onClick={() => {
                    if (!selectable) return;
                    setPending(table);
                    setGuests(Math.max(1, table.minSeats));
                  }}
                  className={cn(
                    'flex w-full flex-col items-start gap-1.5 rounded-base border p-3 text-start',
                    selected
                      ? 'border-primary bg-surface-sunken'
                      : 'border-border bg-surface-raised',
                    !selectable && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <span className="text-lg font-semibold tabular-nums">{table.code}</span>
                  <StatusPill
                    size="sm"
                    label={preset.label}
                    icon={preset.icon}
                    tone={preset.tone}
                    outline={preset.outline}
                  />
                  <span className="text-ink-subtle text-xs tabular-nums">
                    Seats {table.minSeats}–{table.maxSeats}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {pending !== null && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Guests on {pending.code}</h3>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: pending.maxSeats + 2 }, (_, index) => index + 1).map(
                (count) => (
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
                      count > pending.maxSeats && 'border-warn text-warn',
                    )}
                  >
                    {count}
                  </button>
                ),
              )}
            </div>
            {guests > pending.maxSeats && (
              <p className="text-warn mt-2 text-xs font-medium">
                Over capacity for this table. Consider merging with a neighbour.
              </p>
            )}
          </section>
        )}
      </div>
    </Sheet>
  );
}
