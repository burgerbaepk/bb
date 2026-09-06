import { z } from 'zod';
import { PaisaSchema } from './money';
import { TableShapeSchema, TableStatusSchema } from './enums';
import type { TableStatus } from './enums';

/**
 * Floor plan — BUILD-PLAN.md §5.5, §9.
 *
 * Geometry is on the **logical grid** `zone.gridCols × gridRows`, never absolute
 * pixels (§9.3). A floor plan traced at 1440px and rendered on a 768px tablet at
 * pixel coordinates is a floor plan nobody can read, and the tablet is the
 * device it is actually used on.
 *
 * The zone is a column, not a prefix on the table name. The system this replaces
 * encodes it as `1 B`, `1 BU`, `1 F` (defect V9), which makes "how many covers
 * are upstairs" unanswerable without parsing a string.
 */

export const ZoneSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  nameUr: z.string().nullable(),
  sortOrder: z.int(),
  gridCols: z.int().positive(),
  gridRows: z.int().positive(),
  backgroundImageKey: z.string().nullable(),
  isActive: z.boolean(),
});
export type Zone = z.infer<typeof ZoneSchema>;

export const TableGeometrySchema = z.object({
  x: z.int().nonnegative(),
  y: z.int().nonnegative(),
  width: z.int().positive(),
  height: z.int().positive(),
  /** §9.4 — rotation in 45-degree steps. */
  rotation: z.int().min(0).max(315),
});
export type TableGeometry = z.infer<typeof TableGeometrySchema>;

export const FloorTableSchema = z.object({
  id: z.uuid(),
  zoneId: z.uuid(),
  code: z.string().min(1),
  minSeats: z.int().nonnegative(),
  maxSeats: z.int().positive(),
  shape: TableShapeSchema,
  geometry: TableGeometrySchema,
  status: TableStatusSchema,
  statusChangedAt: z.date().nullable(),
  /** §9.2 — merged tables render as one outline with a single chip. */
  mergedIntoId: z.uuid().nullable(),
});
export type FloorTable = z.infer<typeof FloorTableSchema>;

/**
 * §9.2 — everything the table chip renders, and nothing else.
 *
 * `money` is nullable on purpose. §9.2 says to omit the money row entirely for a
 * `WAITER` rather than blur it, and a nullable field is the only way to express
 * "this viewer is not entitled to the figure" without the component inventing a
 * zero. ADR 0019 — there is no more pre-payment check, so the figure is always
 * `Subtotal (ex tax)`; the rate, and so the real total, is not knowable until
 * the customer pays.
 */
export const TableChipMoneySchema = z.object({
  amount: PaisaSchema,
});
export type TableChipMoney = z.infer<typeof TableChipMoneySchema>;

export const TableChipSchema = z.object({
  tableId: z.uuid(),
  code: z.string().min(1),
  zoneName: z.string().min(1),
  status: TableStatusSchema,
  maxSeats: z.int().positive(),
  seatedCount: z.int().nonnegative(),
  /** Counted up from `table_sessions.opened_at`. Never negative (R13). */
  dwellSeconds: z.int().nonnegative(),
  waiterInitials: z.string().nullable(),
  /** Null when the viewer may not see money (§9.2, `WAITER`). */
  money: TableChipMoneySchema.nullable(),
  memberCodes: z.array(z.string()),
});
export type TableChip = z.infer<typeof TableChipSchema>;

/** §9.3 — the summary bar. Derived from the same tables it heads (R16). */
export const FloorSummarySchema = z.object({
  free: z.int().nonnegative(),
  occupied: z.int().nonnegative(),
  cleaning: z.int().nonnegative(),
  coversSeated: z.int().nonnegative(),
  averageDwellSeconds: z.int().nonnegative(),
  longestSeatedTableCode: z.string().nullable(),
  longestSeatedSeconds: z.int().nonnegative(),
});
export type FloorSummary = z.infer<typeof FloorSummarySchema>;

export const TableSessionSchema = z.object({
  id: z.uuid(),
  tableId: z.uuid(),
  openedAt: z.date(),
  closedAt: z.date().nullable(),
  guestCount: z.int().nonnegative(),
  waiterId: z.uuid().nullable(),
  waiterInitials: z.string().nullable(),
  mergedGroupId: z.uuid().nullable(),
  note: z.string().nullable(),
});
export type TableSession = z.infer<typeof TableSessionSchema>;

/** §9.3 — the actions the context sheet offers, filtered by state and permission. */
export const TableActionSchema = z.enum([
  'SEAT_GUESTS',
  'OPEN_ORDER',
  'LOAD_ORDER',
  'TAKE_PAYMENT',
  'TRANSFER',
  'MERGE',
  'SPLIT',
  'MARK_CLEAN',
  'BLOCK',
]);
export type TableAction = z.infer<typeof TableActionSchema>;

/**
 * §9.3 summary bar — R16.
 *
 * A pure projection over the chips being rendered, so the bar and the plan
 * beneath it cannot come from different queries. The system this replaces
 * heads three cards summing Rs. 34,161.30 with "4 orders, Rs. 40,623.70"
 * (defect V1) precisely because the two were computed separately.
 *
 * It lives beside the contract rather than in a screen because three surfaces
 * need it — the floor plan, the phone list, and the M05 floor editor — and
 * three implementations would be three chances to disagree.
 */
export function summariseFloor(chips: readonly TableChip[]): FloorSummary {
  const occupiedStates: readonly TableStatus[] = ['SEATED', 'ORDERED', 'SERVED', 'PAYING'];

  const seated = chips.filter((chip) => chip.dwellSeconds > 0);
  const longest = seated.reduce<TableChip | null>(
    (best, chip) => (best === null || chip.dwellSeconds > best.dwellSeconds ? chip : best),
    null,
  );

  return {
    free: chips.filter((chip) => chip.status === 'FREE').length,
    occupied: chips.filter((chip) => occupiedStates.includes(chip.status)).length,
    cleaning: chips.filter((chip) => chip.status === 'CLEANING').length,
    coversSeated: chips.reduce((total, chip) => total + chip.seatedCount, 0),
    averageDwellSeconds:
      seated.length === 0
        ? 0
        : Math.round(seated.reduce((total, chip) => total + chip.dwellSeconds, 0) / seated.length),
    longestSeatedTableCode: longest?.code ?? null,
    longestSeatedSeconds: longest?.dwellSeconds ?? 0,
  };
}
