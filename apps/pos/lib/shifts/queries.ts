import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { dbRead, outletConfig, shifts, users } from '@natech/db';
import { paisa, type Paisa } from '@natech/domain';
import type { ShiftStatus } from '@natech/domain';

/**
 * Shift reads — BUILD-PLAN.md §5.9; docs/runfiles/M12-shifts.md §3.
 *
 * `Shift` is local, not a `packages/contracts` shape — it backs the till's own
 * header and the auto-open cron's own decision, neither of which is shared
 * across apps (§3 of the runfile: everything cross-app already existed as the
 * frozen `ShiftReport`).
 */
export interface Shift {
  readonly id: string;
  readonly openedBy: string | null;
  readonly openedByName: string | null;
  readonly openedAt: Date;
  readonly closedBy: string | null;
  readonly closedAt: Date | null;
  readonly openingFloat: Paisa;
  readonly countedCash: Paisa | null;
  readonly variance: Paisa | null;
  readonly notes: string | null;
  readonly mode: 'MANUAL' | 'AUTO';
  readonly status: ShiftStatus;
}

const SHIFT_COLUMNS = {
  id: shifts.id,
  openedBy: shifts.openedBy,
  openedByName: users.displayName,
  openedAt: shifts.openedAt,
  closedBy: shifts.closedBy,
  closedAt: shifts.closedAt,
  openingFloat: shifts.openingFloat,
  countedCash: shifts.countedCash,
  variance: shifts.variance,
  notes: shifts.notes,
  mode: shifts.mode,
  status: shifts.status,
} as const;

function toShift(row: {
  id: string;
  openedBy: string | null;
  openedByName: string | null;
  openedAt: Date;
  closedBy: string | null;
  closedAt: Date | null;
  openingFloat: bigint;
  countedCash: bigint | null;
  variance: bigint | null;
  notes: string | null;
  mode: 'MANUAL' | 'AUTO';
  status: ShiftStatus;
}): Shift {
  return {
    ...row,
    openingFloat: paisa(row.openingFloat),
    countedCash: row.countedCash === null ? null : paisa(row.countedCash),
    variance: row.variance === null ? null : paisa(row.variance),
  };
}

/** A specific shift by id — `closeShiftAction`'s post-commit read, to build the emailed Z report from the row as it now stands. */
export async function readShiftById(id: string): Promise<Shift | null> {
  const rows = await dbRead()
    .select(SHIFT_COLUMNS)
    .from(shifts)
    .leftJoin(users, eq(shifts.openedBy, users.id))
    .where(eq(shifts.id, id))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : toShift(row);
}

/** The currently open shift, or null if none is open — `openShiftAction`'s own single-open-shift check reads this too, inside its transaction. */
export async function readOpenShift(): Promise<Shift | null> {
  const rows = await dbRead()
    .select(SHIFT_COLUMNS)
    .from(shifts)
    .leftJoin(users, eq(shifts.openedBy, users.id))
    .where(eq(shifts.status, 'OPEN'))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : toShift(row);
}

/**
 * The shift `/shift` and `/admin/reports/shift` default to: the open one if
 * there is one, otherwise the most recently closed one. Null only on a fresh
 * database that has never opened a shift.
 */
export async function readCurrentOrLastShift(): Promise<Shift | null> {
  const open = await readOpenShift();
  if (open !== null) return open;

  const rows = await dbRead()
    .select(SHIFT_COLUMNS)
    .from(shifts)
    .leftJoin(users, eq(shifts.openedBy, users.id))
    .where(eq(shifts.status, 'CLOSED'))
    .orderBy(desc(shifts.closedAt))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : toShift(row);
}

export interface OutletHours {
  readonly timezone: string;
  /** `HH:MM:SS`, or null — the schema's own nullable columns (§5.1). */
  readonly storeOpen: string | null;
  readonly storeClose: string | null;
  readonly weeklyOffDays: readonly string[];
}

const DEFAULT_TIMEZONE = 'Asia/Karachi';

/** Read-only outlet hours for the auto-open cron's decision (`autoOpen.ts`). */
export async function readOutletHours(): Promise<OutletHours> {
  const rows = await dbRead()
    .select({
      timezone: outletConfig.timezone,
      storeOpen: outletConfig.storeOpen,
      storeClose: outletConfig.storeClose,
      weeklyOffDays: outletConfig.weeklyOffDays,
    })
    .from(outletConfig)
    .where(eq(outletConfig.singleton, true));
  const row = rows[0];
  if (row === undefined) {
    return { timezone: DEFAULT_TIMEZONE, storeOpen: null, storeClose: null, weeklyOffDays: [] };
  }
  return {
    timezone: row.timezone,
    storeOpen: row.storeOpen,
    storeClose: row.storeClose,
    weeklyOffDays: row.weeklyOffDays ?? [],
  };
}
