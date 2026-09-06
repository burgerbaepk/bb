'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleDot, Clock, Sparkles, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Duration, SegmentedControl, useToast } from '@natech/ui';
import type {
  FloorSummary,
  FloorTable,
  TableChip,
  TableStatus,
  Viewer,
  Zone,
} from '@natech/contracts';
import { summariseFloor } from '@natech/contracts';
import {
  markCleanAction,
  mergeTablesAction,
  seatGuestsAction,
  splitTableAction,
  toggleBlockAction,
  transferTableAction,
} from '@/lib/floor/actions';
import { useFloorRealtime } from '@/lib/realtime/useFloorRealtime';
import { TableShape } from './TableShape';
import { TableChipCard } from './TableChipCard';
import { TableContextSheet } from './TableContextSheet';
import { TableTargetSheet } from './TableTargetSheet';

/**
 * Floor plan, service mode — BUILD-PLAN.md §9; docs/runfiles/M09b-floor-live.md.
 *
 * §9.3 asks for four things this component provides: zone tabs with an **All
 * Zones** overview, an SVG canvas on the logical grid, a summary bar, and a
 * context sheet on tap.
 *
 * It also asks for a fifth, which is easy to miss: below 640px, render a
 * grouped **list** using the identical state vocabulary rather than attempting a
 * pinched floor plan on a phone. A floor plan zoomed to fit a phone is a floor
 * plan nobody can tap accurately, and the list answers the same questions.
 *
 * The summary bar is computed from the chips it heads (R16), so a header saying
 * four occupied above three occupied tables is not expressible. A merged
 * secondary table is excluded from that computation entirely (not just zeroed
 * on its own chip, which `listFloorChips` already does) — belt and suspenders
 * against ever double-counting one party across both halves of a merge.
 */
export interface FloorPlanProps {
  readonly zones: readonly Zone[];
  readonly tables: readonly FloorTable[];
  readonly chips: readonly TableChip[];
  readonly viewer: Viewer;
}

const ALL_ZONES = 'ALL';
const POLL_INTERVAL_MS = 3_000;

/** Mirrors `summariseFloor`'s own "occupied" vocabulary (`packages/contracts/src/floor.ts`). */
const OCCUPIED_STATUSES: readonly TableStatus[] = ['SEATED', 'ORDERED', 'SERVED', 'PAYING'];

type Picker =
  | { readonly kind: 'TRANSFER'; readonly source: TableChip }
  | { readonly kind: 'MERGE'; readonly source: TableChip }
  | { readonly kind: 'SPLIT'; readonly source: TableChip; readonly members: readonly FloorTable[] };

export function FloorPlan({ zones, tables, chips, viewer }: FloorPlanProps) {
  const router = useRouter();
  const toast = useToast();
  const [zoneId, setZoneId] = useState<string>(ALL_ZONES);
  const [openTableId, setOpenTableId] = useState<string | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);

  // §16 — poll backstop plus the live stream; both just mean "refetch".
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router]);
  useFloorRealtime(() => router.refresh());

  const tableById = useMemo(() => new Map(tables.map((table) => [table.id, table])), [tables]);
  const chipById = useMemo(() => new Map(chips.map((chip) => [chip.tableId, chip])), [chips]);
  const secondaryIds = useMemo(
    () => new Set(tables.filter((table) => table.mergedIntoId !== null).map((table) => table.id)),
    [tables],
  );

  const visibleZones = zoneId === ALL_ZONES ? zones : zones.filter((zone) => zone.id === zoneId);
  const visibleTables = tables.filter((table) =>
    visibleZones.some((zone) => zone.id === table.zoneId),
  );
  const visibleChips = visibleTables
    .map((table) => chipById.get(table.id))
    .filter((chip): chip is TableChip => chip !== undefined);

  // R16 — derived here, from the very chips rendered below, minus any merged
  // secondary (§3's decision — one party must not count as two occupied
  // tables just because it spans two physical ones).
  const summary = summariseFloor(visibleChips.filter((chip) => !secondaryIds.has(chip.tableId)));
  const openChip = openTableId === null ? null : (chipById.get(openTableId) ?? null);
  const openTable = openTableId === null ? null : (tableById.get(openTableId) ?? null);
  const mergedIntoCode =
    openTable?.mergedIntoId === undefined || openTable.mergedIntoId === null
      ? null
      : (tableById.get(openTable.mergedIntoId)?.code ?? null);

  const runAction = async (
    label: string,
    run: () => Promise<{ readonly ok: boolean; readonly error: string | null }>,
  ) => {
    const result = await run();
    toast.show(
      result.ok ? 'success' : 'error',
      result.ok ? label : (result.error ?? 'That failed.'),
    );
    if (result.ok) router.refresh();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-border flex flex-wrap items-center gap-3 border-b px-4 py-2">
        <SegmentedControl
          label="Zone"
          value={zoneId}
          onChange={setZoneId}
          options={[
            { value: ALL_ZONES, label: 'All zones', count: tables.length },
            ...zones.map((zone) => ({
              value: zone.id,
              label: zone.name,
              count: tables.filter((table) => table.zoneId === zone.id).length,
            })),
          ]}
        />
      </div>

      <FloorSummaryBar summary={summary} />

      {/* §9.3 — the canvas, from the sm breakpoint up. */}
      <div className="hidden flex-1 overflow-auto p-4 sm:block">
        <div
          className={visibleZones.length > 1 ? 'grid gap-6 xl:grid-cols-2' : 'flex justify-center'}
        >
          {visibleZones.map((zone) => (
            <figure key={zone.id} className="min-w-0">
              <figcaption className="text-ink-muted mb-1 text-sm font-medium">
                {zone.name}
              </figcaption>
              <svg
                viewBox={`0 0 ${zone.gridCols} ${zone.gridRows}`}
                className="border-border bg-surface-sunken w-full rounded-base border"
                role="group"
                aria-label={`${zone.name} floor plan`}
              >
                {tables
                  .filter((table) => table.zoneId === zone.id)
                  .map((table) => {
                    const chip = chipById.get(table.id);
                    if (chip === undefined) return null;
                    return (
                      <TableShape
                        key={table.id}
                        table={table}
                        chip={chip}
                        selected={openTableId === table.id}
                        onSelect={setOpenTableId}
                      />
                    );
                  })}
              </svg>
            </figure>
          ))}
        </div>
      </div>

      {/* §9.3 — below 640px, the same vocabulary as a grouped list. */}
      <div className="flex-1 overflow-y-auto p-3 sm:hidden">
        {visibleZones.map((zone) => (
          <section key={zone.id} className="mb-4">
            <h2 className="text-ink-muted mb-2 text-sm font-medium">{zone.name}</h2>
            <ul className="space-y-2">
              {tables
                .filter((table) => table.zoneId === zone.id)
                .map((table) => {
                  const chip = chipById.get(table.id);
                  if (chip === undefined) return null;
                  return (
                    <li key={table.id}>
                      <TableChipCard chip={chip} onOpen={setOpenTableId} />
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </div>

      <TableContextSheet
        chip={openChip}
        viewer={viewer}
        mergedIntoCode={mergedIntoCode}
        onClose={() => setOpenTableId(null)}
        onSeatGuests={(chip, guestCount) => {
          setOpenTableId(null);
          void runAction(`Seated ${guestCount} on Table ${chip.code}`, () =>
            seatGuestsAction(chip.tableId, guestCount),
          );
        }}
        onAction={(action, chip) => {
          setOpenTableId(null);

          switch (action) {
            case 'OPEN_ORDER':
            case 'LOAD_ORDER':
              router.push(`/?tableId=${chip.tableId}`);
              return;
            // M10 — the order screen owns the real payment action; `?action=`
            // tells it to open the payment sheet against the table's order.
            case 'TAKE_PAYMENT':
              router.push(`/?tableId=${chip.tableId}&action=pay`);
              return;
            case 'MARK_CLEAN':
              void runAction(`Table ${chip.code} is free`, () => markCleanAction(chip.tableId));
              return;
            case 'BLOCK':
              void runAction(
                chip.status === 'BLOCKED'
                  ? `Table ${chip.code} is back in service`
                  : `Table ${chip.code} blocked`,
                () => toggleBlockAction(chip.tableId),
              );
              return;
            case 'TRANSFER':
              setPicker({ kind: 'TRANSFER', source: chip });
              return;
            case 'MERGE':
              setPicker({ kind: 'MERGE', source: chip });
              return;
            case 'SPLIT': {
              const members = tables.filter((table) => table.mergedIntoId === chip.tableId);
              if (members.length === 0) {
                toast.show('info', 'Nothing merged into this table.');
                return;
              }
              if (members.length === 1) {
                const [only] = members;
                if (only !== undefined) {
                  void runAction(`Table ${only.code} split off`, () => splitTableAction(only.id));
                }
                return;
              }
              setPicker({ kind: 'SPLIT', source: chip, members });
              return;
            }
          }
        }}
      />

      {picker !== null && (
        <TableTargetSheet
          open
          title={
            picker.kind === 'TRANSFER'
              ? `Transfer Table ${picker.source.code}`
              : picker.kind === 'MERGE'
                ? `Merge with Table ${picker.source.code}`
                : `Split a table from Table ${picker.source.code}`
          }
          description={
            picker.kind === 'TRANSFER'
              ? 'Choose a free table to move this party to.'
              : picker.kind === 'MERGE'
                ? 'Merge only combines a free table into an occupied one.'
                : 'Choose which merged table to return to service on its own.'
          }
          zones={zones}
          tables={picker.kind === 'SPLIT' ? picker.members : tables}
          isEligible={(table) => {
            if (table.id === picker.source.tableId) return false;
            if (picker.kind === 'TRANSFER')
              return table.status === 'FREE' && table.mergedIntoId === null;
            if (picker.kind === 'MERGE') {
              if (table.mergedIntoId !== null) return false;
              return picker.source.status === 'FREE'
                ? OCCUPIED_STATUSES.includes(table.status)
                : table.status === 'FREE';
            }
            return true;
          }}
          confirmLabel={(table) =>
            picker.kind === 'TRANSFER'
              ? `Transfer to Table ${table.code}`
              : picker.kind === 'MERGE'
                ? `Merge with Table ${table.code}`
                : `Split off Table ${table.code}`
          }
          onClose={() => setPicker(null)}
          onConfirm={(table) => {
            if (picker.kind === 'TRANSFER') {
              void runAction(`Transferred to Table ${table.code}`, () =>
                transferTableAction(picker.source.tableId, table.id),
              );
            } else if (picker.kind === 'MERGE') {
              void runAction(`Merged with Table ${table.code}`, () =>
                mergeTablesAction(picker.source.tableId, table.id),
              );
            } else {
              void runAction(`Table ${table.code} split off`, () => splitTableAction(table.id));
            }
          }}
        />
      )}
    </div>
  );
}

/**
 * §9.3 summary bar. R16 — every figure is a function of the chips rendered
 * beneath it, so the two cannot disagree (defects C3, V1).
 */
function FloorSummaryBar({ summary }: { readonly summary: FloorSummary }) {
  return (
    <dl className="border-border bg-surface-raised flex flex-wrap gap-x-6 gap-y-1 border-b px-4 py-2 text-sm">
      <Stat icon={CircleDot} label="Free" value={summary.free} />
      <Stat icon={Users} label="Occupied" value={summary.occupied} />
      <Stat icon={Sparkles} label="Cleaning" value={summary.cleaning} />
      <Stat icon={Users} label="Covers seated" value={summary.coversSeated} />
      <div className="flex items-center gap-1.5">
        <Clock aria-hidden="true" className="text-ink-subtle size-4" />
        <dt className="text-ink-muted">Average dwell</dt>
        <dd>
          <Duration seconds={summary.averageDwellSeconds} label="Average dwell" />
        </dd>
      </div>
      {summary.longestSeatedTableCode !== null && (
        <div className="flex items-center gap-1.5">
          <dt className="text-ink-muted">Longest seated</dt>
          <dd className="font-medium">
            {summary.longestSeatedTableCode}{' '}
            <Duration seconds={summary.longestSeatedSeconds} label="Longest seated" />
          </dd>
        </div>
      )}
    </dl>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  readonly icon: LucideIcon;
  readonly label: string;
  readonly value: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon aria-hidden="true" className="text-ink-subtle size-4" />
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
