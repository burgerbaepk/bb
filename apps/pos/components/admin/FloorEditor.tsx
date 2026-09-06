'use client';

import { useActionState, useCallback, useMemo, useRef, useState } from 'react';
import { Copy, Image as ImageIcon, Plus, RotateCw, Save, Trash2, Undo2 } from 'lucide-react';
import {
  Button,
  Dialog,
  SegmentedControl,
  Sheet,
  SelectField,
  TextField,
  cn,
  useToast,
} from '@natech/ui';
import type { FloorTable, TableShape, Zone } from '@natech/contracts';
import { FLOOR_IDLE } from '@/lib/floor/idle';
import { createZoneAction, saveFloorLayoutAction } from '@/lib/floor/actions';
import { useAutoCloseOnSuccess } from '@/lib/useAutoCloseOnSuccess';
import { PageHeading } from './PageHeading';

/**
 * The floor plan editor — BUILD-PLAN.md §9.3, §9.4; docs/runfiles/M08-menu-floor-brand.md.
 *
 * Everything here happens in **grid units**. §9.3 is explicit that geometry is
 * persisted on the logical grid from `zones.grid_cols × grid_rows` and never as
 * absolute pixels: a plan traced on a 1440px monitor and replayed at pixel
 * coordinates on a 768px tablet is a plan nobody can read, and the tablet is
 * where service actually uses it.
 *
 * So dragging snaps to whole grid cells, rotation steps in 45 degrees (§9.4),
 * and resizing changes `width` and `height` in cells. The pointer maths converts
 * a client coordinate to a cell once, at the boundary, and nothing downstream
 * sees a pixel.
 *
 * The unsaved-changes guard is required by §9.4 and earns its place: a floor
 * plan is twenty minutes of careful work sitting one browser gesture away from
 * being lost. Every edit — drag, rotate, resize, shape, capacity, duplicate,
 * remove, or a freshly added table — only ever touches client state
 * (`layout`/`touchedIds`/`removedIds`); nothing reaches the database until
 * "Save layout" is pressed, and "Discard changes" restores exactly the last
 * persisted `baseline`, however many save cycles have happened on this visit.
 */
const ROTATION_STEP = 45;

/**
 * A client-side hint only, checked before spending a round trip on a presigned
 * URL. `r2.ts`'s `ALLOWED_IMAGE_TYPES` is the authority — it is `server-only`
 * and cannot be imported here — and `requestZoneBackgroundUploadAction`
 * re-checks the same list before minting anything.
 */
const BACKGROUND_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface FloorEditorProps {
  readonly zones: readonly Zone[];
  readonly tables: readonly FloorTable[];
  /** Resolved server-side (`resolveAssetUrl` is `server-only`) — null until R2 is provisioned or a zone has no background. */
  readonly backgroundUrls: Readonly<Record<string, string | null>>;
}

export function FloorEditor({ zones, tables, backgroundUrls }: FloorEditorProps) {
  const toast = useToast();
  const [zoneId, setZoneId] = useState<string>(zones[0]?.id ?? '');

  // `baseline` is the last state known to be persisted — the initial props on
  // load, and whatever `layout` held immediately after each successful save.
  // Discard resets to it; it is deliberately not the `tables` prop, which does
  // not update on this render pass after a save (only a full navigation
  // re-fetches it), so resetting to the prop would undo a save that already
  // succeeded.
  const [baseline, setBaseline] = useState<readonly FloorTable[]>(tables);
  const [layout, setLayout] = useState<readonly FloorTable[]>(tables);
  const [touchedIds, setTouchedIds] = useState<ReadonlySet<string>>(new Set());
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [addingZone, setAddingZone] = useState(false);
  const [addTableOpen, setAddTableOpen] = useState(false);
  const [addTableCode, setAddTableCode] = useState('');
  const backgroundBusy = false;
  const backgroundInputRef = useRef<HTMLInputElement>(null);

  const dirty = touchedIds.size > 0 || removedIds.size > 0;

  const zone = zones.find((candidate) => candidate.id === zoneId) ?? zones[0];
  const zoneTables = useMemo(
    () => layout.filter((table) => table.zoneId === zoneId),
    [layout, zoneId],
  );
  const selected = layout.find((table) => table.id === selectedId) ?? null;

  const markTouched = useCallback((id: string) => {
    setTouchedIds((current) => (current.has(id) ? current : new Set(current).add(id)));
  }, []);

  const updateGeometry = useCallback(
    (id: string, change: Partial<FloorTable['geometry']>) => {
      setLayout((current) =>
        current.map((table) =>
          table.id === id ? { ...table, geometry: { ...table.geometry, ...change } } : table,
        ),
      );
      markTouched(id);
    },
    [markTouched],
  );

  const updateAttributes = useCallback(
    (id: string, change: Partial<Pick<FloorTable, 'shape' | 'minSeats' | 'maxSeats'>>) => {
      setLayout((current) =>
        current.map((table) => (table.id === id ? { ...table, ...change } : table)),
      );
      markTouched(id);
    },
    [markTouched],
  );

  /**
   * Convert a pointer position to a grid cell. This is the only place a pixel
   * becomes a coordinate; everything persisted is in cells.
   */
  const cellFromPointer = useCallback(
    (event: React.PointerEvent<SVGSVGElement>): { x: number; y: number } | null => {
      if (zone === undefined) return null;
      const svg = event.currentTarget;
      const bounds = svg.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) return null;
      return {
        x: Math.round(((event.clientX - bounds.left) / bounds.width) * zone.gridCols),
        y: Math.round(((event.clientY - bounds.top) / bounds.height) * zone.gridRows),
      };
    },
    [zone],
  );

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (selectedId === null || event.buttons === 0 || zone === undefined) return;
    const cell = cellFromPointer(event);
    if (cell === null) return;
    const table = layout.find((candidate) => candidate.id === selectedId);
    if (table === undefined || table.zoneId !== zoneId) return;

    updateGeometry(selectedId, {
      x: clamp(
        cell.x - Math.floor(table.geometry.width / 2),
        0,
        zone.gridCols - table.geometry.width,
      ),
      y: clamp(
        cell.y - Math.floor(table.geometry.height / 2),
        0,
        zone.gridRows - table.geometry.height,
      ),
    });
  };

  const handleDiscard = () => {
    setLayout(baseline);
    setTouchedIds(new Set());
    setRemovedIds(new Set());
    setSelectedId(null);
    setSaveError(null);
    toast.show('info', 'Layout reverted');
  };

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setSaveError(null);

    const edited = layout.filter((table) => touchedIds.has(table.id));
    const result = await saveFloorLayoutAction({
      tables: edited.map((table) => ({
        id: table.id,
        zoneId: table.zoneId,
        code: table.code,
        minSeats: table.minSeats,
        maxSeats: table.maxSeats,
        shape: table.shape,
        geometry: table.geometry,
      })),
      removedIds: Array.from(removedIds),
    });

    setSaving(false);

    if (result.error !== null) {
      setSaveError(result.error);
      toast.show('error', result.error);
      return;
    }

    // `layout` already excludes anything removed this session (Remove filters
    // it out immediately), so it is the new persisted baseline as-is.
    setBaseline(layout);
    setTouchedIds(new Set());
    setRemovedIds(new Set());
    toast.show('success', 'Layout saved');
  };

  const handleDuplicate = useCallback(() => {
    if (selected === null || zone === undefined) return;
    const id = crypto.randomUUID();
    const { width, height } = selected.geometry;
    const duplicate: FloorTable = {
      ...selected,
      id,
      code: nextDuplicateCode(selected.code, selected.zoneId, layout),
      // A duplicate is a brand new physical table, never mid-service — §9.3's
      // live states belong to M09b and start fresh here regardless of what the
      // table it was copied from currently shows.
      status: 'FREE',
      statusChangedAt: null,
      mergedIntoId: null,
      geometry: {
        ...selected.geometry,
        x: clamp(selected.geometry.x + 1, 0, zone.gridCols - width),
        y: clamp(selected.geometry.y + 1, 0, zone.gridRows - height),
      },
    };
    setLayout((current) => [...current, duplicate]);
    markTouched(id);
    setSelectedId(id);
    toast.show('info', `Duplicated as table ${duplicate.code}`);
  }, [selected, zone, layout, markTouched, toast]);

  const handleConfirmRemove = () => {
    if (selected === null) return;
    const wasPersisted = baseline.some((table) => table.id === selected.id);
    const code = selected.code;

    setLayout((current) => current.filter((table) => table.id !== selected.id));
    setTouchedIds((current) => {
      if (!current.has(selected.id)) return current;
      const next = new Set(current);
      next.delete(selected.id);
      return next;
    });
    // Only a table that was actually saved needs a soft-delete on the server;
    // one added and removed within the same unsaved session never existed
    // there and simply drops out of `layout`.
    if (wasPersisted) {
      setRemovedIds((current) => new Set(current).add(selected.id));
    }
    setSelectedId(null);
    setRemoveDialogOpen(false);
    toast.show('info', `Table ${code} removed`);
  };

  const handleAddTable = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (zone === undefined) return;
    const code = addTableCode.trim();
    if (code === '') return;

    const id = crypto.randomUUID();
    const created: FloorTable = {
      id,
      zoneId: zone.id,
      code,
      minSeats: 2,
      maxSeats: 4,
      shape: 'SQUARE',
      // §9.4 — "simplest correct approach: place it at (0,0) sized 3×3 and let
      // the operator drag it, same as any other table." No overlap detection:
      // the grid already shows the operator exactly where it landed.
      geometry: { x: 0, y: 0, width: 3, height: 3, rotation: 0 },
      status: 'FREE',
      statusChangedAt: null,
      mergedIntoId: null,
    };
    setLayout((current) => [...current, created]);
    markTouched(id);
    setSelectedId(id);
    setAddTableOpen(false);
    setAddTableCode('');
    toast.show('info', `Table ${code} added — drag it into position, then save.`);
  };

  const handleBackgroundFile = async (file: File) => {
    void file;
    toast.show('info', 'Background image uploads are disabled.');
  };

  const backgroundUrl = zone === undefined ? null : (backgroundUrls[zone.id] ?? null);

  return (
    <>
      <PageHeading
        title="Floor plan"
        note="Arrange tables and zones to match your restaurant. Save the layout when you are finished."
        actions={
          <>
            <Button icon={Plus} onClick={() => setAddingZone(true)}>
              Add zone
            </Button>
            <Button icon={Undo2} disabled={!dirty || saving} onClick={handleDiscard}>
              Discard changes
            </Button>
            <Button
              tone="primary"
              icon={Save}
              disabled={!dirty || saving}
              onClick={() => void handleSave()}
            >
              {saving ? 'Saving…' : 'Save layout'}
            </Button>
          </>
        }
      />

      {/* §9.4 — the unsaved-changes guard. */}
      {dirty && (
        <p
          role="status"
          className="border-warn bg-warn-soft text-warn mb-4 rounded-base border px-3 py-2 text-sm font-medium"
        >
          Unsaved changes. Leaving this page now loses the layout.
        </p>
      )}
      {saveError !== null && (
        <p
          role="alert"
          className="border-danger bg-danger-soft text-danger mb-4 rounded-base border px-3 py-2 text-sm font-medium"
        >
          {saveError}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <SegmentedControl
          label="Zone"
          value={zoneId}
          onChange={(next) => {
            setZoneId(next);
            setSelectedId(null);
          }}
          options={zones.map((candidate) => ({
            value: candidate.id,
            label: candidate.name,
            count: layout.filter((table) => table.zoneId === candidate.id).length,
          }))}
        />
        <Button
          size="sm"
          icon={Plus}
          disabled={zone === undefined}
          onClick={() => setAddTableOpen(true)}
        >
          Add table
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <div>
          <svg
            viewBox={`0 0 ${zone?.gridCols ?? 40} ${zone?.gridRows ?? 24}`}
            className="border-border bg-surface-sunken w-full touch-none rounded-base border"
            role="application"
            aria-label={`${zone?.name ?? 'Zone'} layout editor`}
            onPointerMove={onPointerMove}
          >
            {backgroundUrl !== null && zone !== undefined && (
              <image
                href={backgroundUrl}
                x={0}
                y={0}
                width={zone.gridCols}
                height={zone.gridRows}
                preserveAspectRatio="none"
                opacity={0.5}
                aria-hidden="true"
              />
            )}
            <GridLines cols={zone?.gridCols ?? 40} rows={zone?.gridRows ?? 24} />
            {zoneTables.map((table) => (
              <EditorTable
                key={table.id}
                table={table}
                selected={table.id === selectedId}
                onSelect={setSelectedId}
              />
            ))}
          </svg>
          <p className="text-ink-subtle mt-2 text-xs">
            Tap a table to select it, then drag to move. Positions snap to whole grid cells.
          </p>
        </div>

        <aside className="border-border bg-surface-raised rounded-base border p-4">
          {selected === null ? (
            <p className="text-ink-muted text-sm">
              Select a table to edit its position, size, shape, and capacity.
            </p>
          ) : (
            <TableInspector
              table={selected}
              zone={zone}
              onGeometry={(change) => updateGeometry(selected.id, change)}
              onAttributes={(change) => updateAttributes(selected.id, change)}
              onDuplicate={handleDuplicate}
              onDelete={() => setRemoveDialogOpen(true)}
              onZoneBackground={() => backgroundInputRef.current?.click()}
              backgroundBusy={backgroundBusy}
            />
          )}
        </aside>
      </div>

      <input
        ref={backgroundInputRef}
        type="file"
        accept={BACKGROUND_MIME_TYPES.join(',')}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file !== undefined) void handleBackgroundFile(file);
        }}
      />

      {selected !== null && (
        <Dialog
          open={removeDialogOpen}
          onClose={() => setRemoveDialogOpen(false)}
          title={`Remove table ${selected.code}?`}
          description="Save the layout to apply this removal, or discard changes to keep the table."
          footer={
            <>
              <Button onClick={() => setRemoveDialogOpen(false)}>Cancel</Button>
              <Button tone="danger" icon={Trash2} onClick={handleConfirmRemove}>
                Remove table
              </Button>
            </>
          }
        />
      )}

      {addingZone && <AddZoneSheet onClose={() => setAddingZone(false)} />}

      {addTableOpen && zone !== undefined && (
        <Dialog
          open
          onClose={() => setAddTableOpen(false)}
          title={`Add a table to ${zone.name}`}
          description="Placed at the top-left corner sized 3×3 cells — drag it into position afterwards."
          footer={
            <>
              <Button onClick={() => setAddTableOpen(false)}>Cancel</Button>
              <Button
                tone="primary"
                type="submit"
                form="add-table-form"
                disabled={addTableCode.trim() === ''}
              >
                Add table
              </Button>
            </>
          }
        >
          <form id="add-table-form" onSubmit={handleAddTable}>
            <TextField
              label="Table code"
              value={addTableCode}
              onChange={(event) => setAddTableCode(event.target.value)}
              placeholder="29"
              autoFocus
              help="Only needs to be unique within this zone."
              required
            />
          </form>
        </Dialog>
      )}
    </>
  );
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

/** `<zone>-1 copy`, then `copy 2`, `copy 3` … — the same code space `tables_zone_code_idx` enforces. */
function nextDuplicateCode(
  baseCode: string,
  zoneId: string,
  current: readonly FloorTable[],
): string {
  const used = new Set(
    current.filter((table) => table.zoneId === zoneId).map((table) => table.code),
  );
  let candidate = `${baseCode} copy`;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${baseCode} copy ${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function GridLines({ cols, rows }: { readonly cols: number; readonly rows: number }) {
  return (
    <g aria-hidden="true" className="stroke-border" strokeWidth={0.05}>
      {Array.from({ length: cols + 1 }, (_, index) => (
        <line key={`v${index}`} x1={index} y1={0} x2={index} y2={rows} />
      ))}
      {Array.from({ length: rows + 1 }, (_, index) => (
        <line key={`h${index}`} x1={0} y1={index} x2={cols} y2={index} />
      ))}
    </g>
  );
}

function EditorTable({
  table,
  selected,
  onSelect,
}: {
  readonly table: FloorTable;
  readonly selected: boolean;
  readonly onSelect: (id: string) => void;
}) {
  const { x, y, width, height, rotation } = table.geometry;
  const centreX = x + width / 2;
  const centreY = y + height / 2;

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`Table ${table.code}`}
      data-table-code={table.code}
      data-geometry={`${x},${y},${width},${height},${rotation}`}
      transform={`rotate(${rotation} ${centreX} ${centreY})`}
      onPointerDown={() => onSelect(table.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(table.id);
        }
      }}
      className="cursor-move"
    >
      {table.shape === 'ROUND' ? (
        <ellipse
          cx={centreX}
          cy={centreY}
          rx={width / 2}
          ry={height / 2}
          strokeWidth={selected ? 0.4 : 0.2}
          className={cn(
            'fill-surface-raised',
            selected ? 'stroke-primary' : 'stroke-border-strong',
          )}
        />
      ) : (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={0.6}
          strokeWidth={selected ? 0.4 : 0.2}
          className={cn(
            'fill-surface-raised',
            selected ? 'stroke-primary' : 'stroke-border-strong',
          )}
        />
      )}
      <text
        x={centreX}
        y={centreY + 0.5}
        textAnchor="middle"
        className="fill-ink pointer-events-none font-semibold"
        style={{ fontSize: 1.6 }}
      >
        {table.code}
      </text>
    </g>
  );
}

const SHAPES: readonly { value: TableShape; label: string }[] = [
  { value: 'SQUARE', label: 'Square' },
  { value: 'ROUND', label: 'Round' },
  { value: 'RECT', label: 'Rectangle' },
  { value: 'BOOTH', label: 'Booth' },
  { value: 'BAR_STOOL', label: 'Bar stool' },
];

/**
 * The inspector — §9.4.
 *
 * Capacity is edited here and is not cosmetic (P8). It drives the occupancy
 * dots on the table chip, the covers figure in the floor summary, and revenue
 * per seat-hour in the Floor Performance report. Every table in the system this
 * replaces is capacity 4, which is certainly wrong and makes all three wrong
 * with it.
 */
function TableInspector({
  table,
  zone,
  onGeometry,
  onAttributes,
  onDuplicate,
  onDelete,
  onZoneBackground,
  backgroundBusy,
}: {
  readonly table: FloorTable;
  readonly zone: Zone | undefined;
  readonly onGeometry: (change: Partial<FloorTable['geometry']>) => void;
  readonly onAttributes: (
    change: Partial<Pick<FloorTable, 'shape' | 'minSeats' | 'maxSeats'>>,
  ) => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
  readonly onZoneBackground: () => void;
  readonly backgroundBusy: boolean;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Table {table.code}</h2>

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Column"
          value={String(table.geometry.x)}
          onChange={(event) => onGeometry({ x: Number(event.target.value) })}
          inputMode="numeric"
          tabular
          help={`0 to ${(zone?.gridCols ?? 40) - table.geometry.width}`}
        />
        <TextField
          label="Row"
          value={String(table.geometry.y)}
          onChange={(event) => onGeometry({ y: Number(event.target.value) })}
          inputMode="numeric"
          tabular
          help={`0 to ${(zone?.gridRows ?? 24) - table.geometry.height}`}
        />
        <TextField
          label="Width in cells"
          value={String(table.geometry.width)}
          onChange={(event) => onGeometry({ width: Math.max(1, Number(event.target.value)) })}
          inputMode="numeric"
          tabular
        />
        <TextField
          label="Height in cells"
          value={String(table.geometry.height)}
          onChange={(event) => onGeometry({ height: Math.max(1, Number(event.target.value)) })}
          inputMode="numeric"
          tabular
        />
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium">Rotation</p>
        <div className="flex items-center gap-2">
          <Button
            icon={RotateCw}
            onClick={() =>
              onGeometry({ rotation: (table.geometry.rotation + ROTATION_STEP) % 360 })
            }
          >
            Rotate {ROTATION_STEP}°
          </Button>
          <span className="text-ink-muted text-sm tabular-nums">{table.geometry.rotation}°</span>
        </div>
      </div>

      <SelectField
        label="Shape"
        value={table.shape}
        onChange={(event) => onAttributes({ shape: event.target.value as TableShape })}
        options={SHAPES.map((shape) => ({ value: shape.value, label: shape.label }))}
      />

      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Minimum seats"
          value={String(table.minSeats)}
          onChange={(event) => onAttributes({ minSeats: Math.max(0, Number(event.target.value)) })}
          inputMode="numeric"
          tabular
        />
        <TextField
          label="Maximum seats"
          value={String(table.maxSeats)}
          onChange={(event) => onAttributes({ maxSeats: Math.max(1, Number(event.target.value)) })}
          inputMode="numeric"
          tabular
          help="Drives the occupancy dots, the covers count, and revenue per seat-hour."
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={Copy} onClick={onDuplicate}>
          Duplicate
        </Button>
        <Button size="sm" icon={ImageIcon} onClick={onZoneBackground} disabled={backgroundBusy}>
          {backgroundBusy ? 'Uploading…' : 'Zone background'}
        </Button>
        <Button size="sm" tone="danger" icon={Trash2} onClick={onDelete}>
          Remove
        </Button>
      </div>
    </div>
  );
}

function AddZoneSheet({ onClose }: { readonly onClose: () => void }) {
  const [state, action, pending] = useActionState(createZoneAction, FLOOR_IDLE);
  useAutoCloseOnSuccess(onClose, state.message);

  return (
    <Sheet
      open
      onClose={onClose}
      title="Add a zone"
      description="Name the zone and choose its grid size, then add tables."
      side="inline-end"
    >
      <form action={action} className="space-y-4">
        <TextField label="Name" name="name" required />
        <TextField label="Name (Urdu)" name="nameUr" />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Columns"
            name="gridCols"
            type="number"
            defaultValue={40}
            inputMode="numeric"
            required
          />
          <TextField
            label="Rows"
            name="gridRows"
            type="number"
            defaultValue={24}
            inputMode="numeric"
            required
          />
        </div>

        {state.error !== null && (
          <p
            role="alert"
            className="border-danger bg-danger-soft text-danger rounded-base border px-3 py-2 text-sm"
          >
            {state.error}
          </p>
        )}
        {state.message !== null && (
          <p
            role="status"
            className="border-ok bg-ok-soft text-ok rounded-base border px-3 py-2 text-sm"
          >
            {state.message}
          </p>
        )}

        <Button tone="primary" block type="submit" disabled={pending}>
          {pending ? 'Creating…' : 'Create zone'}
        </Button>
      </form>
    </Sheet>
  );
}
