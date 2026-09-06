/**
 * Tables — BUILD-PLAN.md §5.5, pre-flight P8.
 *
 * P8: every table in the existing system is capacity 4, which is certainly
 * wrong — a restaurant does not have twenty identical tables. §20 defaults to
 * min 2 / max 4 until the restaurant measures the floor.
 *
 * Capacity is not cosmetic. It drives the occupancy dots on the table chip
 * (§9.2), the covers-seated figure in the floor summary (§9.3), and revenue per
 * seat-hour in the Floor Performance report (§17). All three are wrong until
 * P8 is answered.
 *
 * Geometry (x, y, width, height) is on the logical grid from `zones`, never
 * pixels (§9.3). These positions are a placeholder layout; the real one is
 * traced against a photo in the M08 floor plan editor.
 */
export interface TableSeed {
  readonly zone: string;
  readonly code: string;
  readonly minSeats: number;
  readonly maxSeats: number;
  readonly shape: 'ROUND' | 'SQUARE' | 'RECT' | 'BOOTH' | 'BAR_STOOL';
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function grid(zone: string, count: number, startCode: number): TableSeed[] {
  const perRow = 6;
  return Array.from({ length: count }, (_, i) => ({
    zone,
    code: String(startCode + i),
    minSeats: 2,
    maxSeats: 4,
    shape: 'SQUARE' as const,
    x: 3 + (i % perRow) * 6,
    y: 3 + Math.floor(i / perRow) * 6,
    width: 4,
    height: 4,
  }));
}

export const TABLES: readonly TableSeed[] = [
  ...grid('Front', 8, 1),
  ...grid('Bala', 8, 9),
  ...grid('Upstairs', 6, 17),
  ...grid('Bala Upstairs', 6, 23),
];
