import { cn } from '@natech/ui';
import type { FloorTable, TableChip } from '@natech/contracts';

/**
 * One table on the canvas — BUILD-PLAN.md §9.1, §9.2, §9.3.
 *
 * Drawn on the logical grid from `zones.grid_cols × grid_rows`, scaled to fit
 * by the SVG viewBox. No absolute pixel positions (§9.3), so the same plan is
 * legible on a 768px tablet and a desk monitor.
 *
 * State is fill **plus** border treatment **plus** the icon and label the chip
 * carries alongside it (R15). Colour alone never says anything here: a floor
 * plan is read across a room, often by somebody on their second week, and about
 * one man in twelve cannot separate the red state from the green one.
 *
 * Ageing is border weight and a tint ramp, not a fourth colour (§9.2).
 */
const STATE_FILL: Readonly<Record<TableChip['status'], string>> = {
  FREE: 'fill-surface-raised stroke-border-strong [stroke-dasharray:4_3]',
  RESERVED: 'fill-info-soft stroke-info',
  SEATED: 'fill-info-soft stroke-info',
  ORDERED: 'fill-warn-soft stroke-warn',
  SERVED: 'fill-ok-soft stroke-ok',
  PAYING: 'fill-info-soft stroke-info',
  CLEANING: 'fill-surface-sunken stroke-border-strong',
  BLOCKED: 'fill-danger-soft stroke-danger',
};

export interface TableShapeProps {
  readonly table: FloorTable;
  readonly chip: TableChip;
  readonly selected: boolean;
  readonly onSelect: (tableId: string) => void;
}

export function TableShape({ table, chip, selected, onSelect }: TableShapeProps) {
  const { x, y, width, height, rotation } = table.geometry;
  const centreX = x + width / 2;
  const centreY = y + height / 2;

  // Ageing: a table sitting longer draws a heavier outline. One step only, so
  // the ramp reads as emphasis rather than as another state.
  const strokeWidth = chip.dwellSeconds > 3600 ? 0.35 : 0.2;

  const label = `Table ${table.code}, ${chip.status.toLowerCase().replace('_', ' ')}`;

  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      transform={`rotate(${rotation} ${centreX} ${centreY})`}
      onClick={() => onSelect(table.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(table.id);
        }
      }}
      className="cursor-pointer focus-visible:outline-none"
    >
      {table.shape === 'ROUND' ? (
        <ellipse
          cx={centreX}
          cy={centreY}
          rx={width / 2}
          ry={height / 2}
          strokeWidth={strokeWidth}
          className={cn(STATE_FILL[chip.status], selected && 'stroke-primary')}
        />
      ) : (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={table.shape === 'BAR_STOOL' ? Math.min(width, height) / 2 : 0.6}
          strokeWidth={strokeWidth}
          className={cn(STATE_FILL[chip.status], selected && 'stroke-primary')}
        />
      )}

      {/* §9.3 — the PAYING pulse is the only ambient animation in the product,
          and `motion-safe` is how prefers-reduced-motion suppresses it. */}
      {chip.status === 'PAYING' && (
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          rx={0.6}
          fill="none"
          strokeWidth={0.3}
          className="stroke-info motion-safe:animate-pulse"
        />
      )}

      <text
        x={centreX}
        y={centreY + 0.5}
        textAnchor="middle"
        className="fill-ink pointer-events-none font-semibold"
        style={{ fontSize: 1.8 }}
      >
        {table.code}
      </text>

      {chip.seatedCount > 0 && (
        <text
          x={centreX}
          y={centreY + 2.2}
          textAnchor="middle"
          className="fill-ink-muted pointer-events-none"
          style={{ fontSize: 1.1 }}
        >
          {chip.seatedCount}/{chip.maxSeats}
        </text>
      )}
    </g>
  );
}
