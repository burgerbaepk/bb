'use client';

import { useState } from 'react';
import { Button, SegmentedControl, Sheet, StatusPill, TABLE_STATE_PRESETS, cn } from '@natech/ui';
import type { FloorTable, Zone } from '@natech/contracts';

/**
 * Pick a destination table — BUILD-PLAN.md §9.3;
 * docs/runfiles/M09b-floor-live.md §3.
 *
 * The tap-and-pick substitute for §9.3's drag gesture (see the runfile's own
 * decision on why): `TRANSFER` and `MERGE` both reduce to "choose one other
 * table, subject to a rule specific to which action this is" — the rule
 * itself lives in the `isEligible` predicate the caller supplies, not here.
 * Structurally close to `order/TablePickerSheet.tsx` (zone tabs, a grid of
 * table buttons) but without that sheet's guest-count stepper, which neither
 * transfer nor merge needs.
 */
export interface TableTargetSheetProps {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly zones: readonly Zone[];
  readonly tables: readonly FloorTable[];
  readonly isEligible: (table: FloorTable) => boolean;
  readonly confirmLabel: (table: FloorTable) => string;
  readonly onClose: () => void;
  readonly onConfirm: (table: FloorTable) => void;
}

export function TableTargetSheet({
  open,
  title,
  description,
  zones,
  tables,
  isEligible,
  confirmLabel,
  onClose,
  onConfirm,
}: TableTargetSheetProps) {
  const [zoneId, setZoneId] = useState<string>(zones[0]?.id ?? '');
  const [picked, setPicked] = useState<FloorTable | null>(null);

  const close = () => {
    setPicked(null);
    onClose();
  };

  const zoneTables = tables.filter((table) => table.zoneId === zoneId);

  return (
    <Sheet
      open={open}
      onClose={close}
      title={title}
      description={description}
      side="inline-start"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button
            tone="primary"
            disabled={picked === null}
            onClick={() => {
              if (picked !== null) onConfirm(picked);
              close();
            }}
          >
            {picked === null ? 'Choose a table' : confirmLabel(picked)}
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
            const eligible = isEligible(table);
            const selected = picked?.id === table.id;
            return (
              <li key={table.id}>
                <button
                  type="button"
                  disabled={!eligible}
                  onClick={() => setPicked(table)}
                  className={cn(
                    'flex w-full flex-col items-start gap-1.5 rounded-base border p-3 text-start',
                    selected
                      ? 'border-primary bg-surface-sunken'
                      : 'border-border bg-surface-raised',
                    !eligible && 'opacity-40',
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
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Sheet>
  );
}
