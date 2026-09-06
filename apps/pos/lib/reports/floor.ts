import 'server-only';
import { and, between, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import {
  dbRead,
  invoices,
  orders,
  outletConfig,
  tableSessions,
  tables,
  users,
  zones,
} from '@natech/db';
import { divideHalfUp, paisa, sum, ZERO, type Paisa } from '@natech/domain';
import type { CoversPerWaiterRow, DateRange, FloorPerformanceRow } from '@natech/contracts';
import { computeBusinessDate, type BusinessDayConfig } from '../orders/businessDateLogic';

/**
 * Floor Performance and Covers-per-Waiter — BUILD-PLAN.md §17, §5.5;
 * docs/runfiles/M13-reporting.md §3.
 *
 * `table_sessions` carries no `business_date` of its own (§5.5's schema, M02),
 * so each session's business date is computed from its `opened_at` with the
 * same `computeBusinessDate` every other business-date read in this codebase
 * uses — never a separate cutoff calculation invented for this one table.
 * Only closed sessions are counted; one still in progress has no dwell yet.
 */

const DEFAULT_TIMEZONE = 'Asia/Karachi';
const DEFAULT_CUTOFF = '05:00';

async function readBusinessDayConfigOrDefault(): Promise<BusinessDayConfig> {
  const rows = await dbRead()
    .select({ timezone: outletConfig.timezone, cutoff: outletConfig.businessDayCutoff })
    .from(outletConfig)
    .where(eq(outletConfig.singleton, true));
  const row = rows[0];
  return row === undefined
    ? { timezone: DEFAULT_TIMEZONE, cutoff: DEFAULT_CUTOFF }
    : { timezone: row.timezone, cutoff: row.cutoff };
}

type Daypart = 'Breakfast' | 'Lunch' | 'Dinner' | 'Late night';

/** Four fixed local-hour bands — BUILD-PLAN §17 asks for "daypart", not for one an operator can edit. */
function daypartOf(at: Date, timezone: string): Daypart {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: timezone }).format(
      at,
    ),
  );
  if (hour >= 5 && hour < 11) return 'Breakfast';
  if (hour >= 11 && hour < 16) return 'Lunch';
  if (hour >= 16 && hour < 23) return 'Dinner';
  return 'Late night';
}

interface ClosedSession {
  readonly id: string;
  readonly tableId: string;
  readonly openedAt: Date;
  readonly closedAt: Date;
  readonly guestCount: number;
  readonly waiterId: string | null;
  readonly zoneName: string;
  readonly maxSeats: number;
  readonly businessDate: string;
  readonly daypart: Daypart;
}

/** A day either side of the range, so a session opened near midnight in any timezone still lands in the coarse fetch. */
function coarseBounds(range: DateRange): { from: Date; to: Date } {
  const from = new Date(`${range.fromBusinessDate}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 1);
  const to = new Date(`${range.toBusinessDate}T00:00:00Z`);
  to.setUTCDate(to.getUTCDate() + 2);
  return { from, to };
}

async function readClosedSessions(
  range: DateRange,
  config: BusinessDayConfig,
): Promise<ClosedSession[]> {
  const { from, to } = coarseBounds(range);
  const rows = await dbRead()
    .select({
      id: tableSessions.id,
      tableId: tableSessions.tableId,
      openedAt: tableSessions.openedAt,
      closedAt: tableSessions.closedAt,
      guestCount: tableSessions.guestCount,
      waiterId: tableSessions.waiterId,
      zoneName: zones.name,
      maxSeats: tables.maxSeats,
    })
    .from(tableSessions)
    .innerJoin(tables, eq(tableSessions.tableId, tables.id))
    .innerJoin(zones, eq(tables.zoneId, zones.id))
    .where(
      and(
        isNotNull(tableSessions.closedAt),
        between(tableSessions.openedAt, from, to),
        isNull(tableSessions.deletedAt),
      ),
    );

  return rows
    .filter((row): row is typeof row & { closedAt: Date } => row.closedAt !== null)
    .map((row) => ({
      id: row.id,
      tableId: row.tableId,
      openedAt: row.openedAt,
      closedAt: row.closedAt,
      guestCount: row.guestCount,
      waiterId: row.waiterId,
      zoneName: row.zoneName,
      maxSeats: row.maxSeats,
      businessDate: computeBusinessDate(row.openedAt, config),
      daypart: daypartOf(row.openedAt, config.timezone),
    }));
}

/** One decimal place by integer rounding — `.toFixed()` is banned outside the render boundary (R1's lint rule; turns is not money, but the rule cannot tell). */
function oneDecimal(numerator: number, denominator: number): string {
  const tenths = Math.round((numerator * 10) / Math.max(1, denominator));
  return `${Math.floor(tenths / 10)}.${tenths % 10}`;
}

function inRange(businessDate: string, range: DateRange): boolean {
  return businessDate >= range.fromBusinessDate && businessDate <= range.toBusinessDate;
}

async function readNetSalesBySession(sessionIds: readonly string[]): Promise<Map<string, Paisa>> {
  if (sessionIds.length === 0) return new Map();
  const rows = await dbRead()
    .select({ tableSessionId: orders.tableSessionId, taxableBase: invoices.taxableBase })
    .from(invoices)
    .innerJoin(orders, eq(invoices.orderId, orders.id))
    .where(and(inArray(orders.tableSessionId, sessionIds), isNull(invoices.deletedAt)));

  const bySession = new Map<string, Paisa[]>();
  for (const row of rows) {
    if (row.tableSessionId === null) continue;
    const existing = bySession.get(row.tableSessionId);
    const amount = paisa(row.taxableBase);
    if (existing === undefined) bySession.set(row.tableSessionId, [amount]);
    else existing.push(amount);
  }
  return new Map([...bySession.entries()].map(([id, amounts]) => [id, sum(amounts)]));
}

export async function readFloorPerformance(range: DateRange): Promise<FloorPerformanceRow[]> {
  const config = await readBusinessDayConfigOrDefault();
  const allSessions = await readClosedSessions(range, config);
  const netSalesBySession = await readNetSalesBySession(allSessions.map((session) => session.id));

  interface Bucket {
    readonly zoneName: string;
    readonly daypart: Daypart;
    tables: Set<string>;
    sessionCount: number;
    dwellSecondsTotal: number;
    covers: number;
    netSales: Paisa;
    seatSecondsTotal: number;
    deadTableSeconds: number;
  }
  const buckets = new Map<string, Bucket>();
  function bucketFor(zoneName: string, daypart: Daypart): Bucket {
    const key = `${zoneName}-${daypart}`;
    const existing = buckets.get(key);
    if (existing !== undefined) return existing;
    const created: Bucket = {
      zoneName,
      daypart,
      tables: new Set(),
      sessionCount: 0,
      dwellSecondsTotal: 0,
      covers: 0,
      netSales: ZERO,
      seatSecondsTotal: 0,
      deadTableSeconds: 0,
    };
    buckets.set(key, created);
    return created;
  }

  for (const session of allSessions) {
    if (!inRange(session.businessDate, range)) continue;
    const dwellSeconds = Math.max(
      0,
      Math.floor((session.closedAt.getTime() - session.openedAt.getTime()) / 1000),
    );
    const bucket = bucketFor(session.zoneName, session.daypart);
    bucket.tables.add(session.tableId);
    bucket.sessionCount += 1;
    bucket.dwellSecondsTotal += dwellSeconds;
    bucket.covers += session.guestCount;
    bucket.netSales = paisa(bucket.netSales + (netSalesBySession.get(session.id) ?? ZERO));
    bucket.seatSecondsTotal += session.maxSeats * dwellSeconds;
  }

  // Dead-table time — the gap between one session's close and the same
  // table's next open, attributed wholly to the earlier session's own
  // bucket. `# ponytail: not split across a gap that may cross a daypart
  // boundary; upgrade to interval splitting only if a reader asks why a long
  // gap concentrates in one bucket.`
  const byTable = new Map<string, ClosedSession[]>();
  for (const session of allSessions) {
    const existing = byTable.get(session.tableId);
    if (existing === undefined) byTable.set(session.tableId, [session]);
    else existing.push(session);
  }
  for (const sessions of byTable.values()) {
    const sorted = [...sessions].sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const current = sorted[i];
      const next = sorted[i + 1];
      if (current === undefined || next === undefined) continue;
      if (!inRange(current.businessDate, range)) continue;
      const gapSeconds = Math.max(
        0,
        Math.floor((next.openedAt.getTime() - current.closedAt.getTime()) / 1000),
      );
      bucketFor(current.zoneName, current.daypart).deadTableSeconds += gapSeconds;
    }
  }

  return [...buckets.values()]
    .map((bucket) => ({
      zoneName: bucket.zoneName,
      daypart: bucket.daypart,
      turns: oneDecimal(bucket.sessionCount, bucket.tables.size),
      averageDwellSeconds: Math.round(bucket.dwellSecondsTotal / Math.max(1, bucket.sessionCount)),
      covers: bucket.covers,
      revenuePerSeatHour:
        bucket.seatSecondsTotal === 0
          ? ZERO
          : paisa(divideHalfUp(bucket.netSales * 3600n, BigInt(bucket.seatSecondsTotal))),
      deadTableSeconds: bucket.deadTableSeconds,
    }))
    .sort((a, b) => a.zoneName.localeCompare(b.zoneName) || a.daypart.localeCompare(b.daypart));
}

export async function readCoversPerWaiter(range: DateRange): Promise<CoversPerWaiterRow[]> {
  const config = await readBusinessDayConfigOrDefault();
  const allSessions = await readClosedSessions(range, config);
  const sessionsInRange = allSessions.filter((session) => inRange(session.businessDate, range));

  const orderRows = await dbRead()
    .select({ waiterId: orders.waiterId, taxableBase: invoices.taxableBase })
    .from(invoices)
    .innerJoin(orders, eq(invoices.orderId, orders.id))
    .where(
      and(
        between(invoices.businessDate, range.fromBusinessDate, range.toBusinessDate),
        isNull(invoices.deletedAt),
      ),
    );

  interface WaiterStats {
    covers: number;
    dwellSecondsTotal: number;
    sessionCount: number;
    orders: number;
    netSales: Paisa;
  }
  const byWaiter = new Map<string, WaiterStats>();
  function statsFor(waiterId: string): WaiterStats {
    const existing = byWaiter.get(waiterId);
    if (existing !== undefined) return existing;
    const created: WaiterStats = {
      covers: 0,
      dwellSecondsTotal: 0,
      sessionCount: 0,
      orders: 0,
      netSales: ZERO,
    };
    byWaiter.set(waiterId, created);
    return created;
  }

  for (const session of sessionsInRange) {
    if (session.waiterId === null) continue;
    const stats = statsFor(session.waiterId);
    stats.covers += session.guestCount;
    stats.dwellSecondsTotal += Math.max(
      0,
      Math.floor((session.closedAt.getTime() - session.openedAt.getTime()) / 1000),
    );
    stats.sessionCount += 1;
  }
  for (const row of orderRows) {
    if (row.waiterId === null) continue;
    const stats = statsFor(row.waiterId);
    stats.orders += 1;
    stats.netSales = paisa(stats.netSales + paisa(row.taxableBase));
  }

  const waiterIds = [...byWaiter.keys()];
  const nameRows =
    waiterIds.length === 0
      ? []
      : await dbRead()
          .select({ id: users.id, displayName: users.displayName })
          .from(users)
          .where(inArray(users.id, waiterIds));
  const nameById = new Map(nameRows.map((row) => [row.id, row.displayName]));

  return [...byWaiter.entries()]
    .map(([waiterId, stats]) => ({
      waiterName: nameById.get(waiterId) ?? 'Unknown',
      covers: stats.covers,
      orders: stats.orders,
      netSales: stats.netSales,
      averageDwellSeconds: Math.round(stats.dwellSecondsTotal / Math.max(1, stats.sessionCount)),
    }))
    .sort((a, b) => (b.netSales > a.netSales ? 1 : b.netSales < a.netSales ? -1 : 0));
}
