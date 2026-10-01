import 'server-only';
import { and, asc, between, desc, eq, gte, isNotNull, isNull, or } from 'drizzle-orm';
import { attendance, dbRead, employees } from '@natech/db';
import { normaliseTime, type AttendanceStatus, type MonthRow } from './register';

/**
 * The staff register and the attendance book — ADR 0032,
 * docs/runfiles/M26-attendance.md. Reads only, through `dbRead` (R2).
 */

export interface EmployeeRow {
  readonly id: string;
  readonly name: string;
  readonly jobTitle: string | null;
  readonly phone: string | null;
  readonly isActive: boolean;
}

export interface RegisterRow {
  readonly employeeId: string;
  readonly name: string;
  readonly jobTitle: string | null;
  readonly status: AttendanceStatus | null;
  readonly timeIn: string | null;
  readonly timeOut: string | null;
  readonly note: string | null;
}

/** Postgres `time` arrives as `HH:MM:SS`; the book and the form speak `HH:MM`. */
const hhmm = (value: string | null): string | null =>
  value === null ? null : normaliseTime(value);

export async function readEmployees(): Promise<EmployeeRow[]> {
  return dbRead()
    .select({
      id: employees.id,
      name: employees.name,
      jobTitle: employees.jobTitle,
      phone: employees.phone,
      isActive: employees.isActive,
    })
    .from(employees)
    .where(isNull(employees.deletedAt))
    .orderBy(desc(employees.isActive), asc(employees.name));
}

/**
 * One day of the book: every active person, plus anyone since deactivated who
 * already has a row that day — a past register must still read as written.
 */
export async function readRegister(businessDate: string): Promise<RegisterRow[]> {
  const rows = await dbRead()
    .select({
      employeeId: employees.id,
      name: employees.name,
      jobTitle: employees.jobTitle,
      status: attendance.status,
      timeIn: attendance.timeIn,
      timeOut: attendance.timeOut,
      note: attendance.note,
    })
    .from(employees)
    .leftJoin(
      attendance,
      and(
        eq(attendance.employeeId, employees.id),
        eq(attendance.businessDate, businessDate),
        isNull(attendance.deletedAt),
      ),
    )
    .where(
      and(isNull(employees.deletedAt), or(eq(employees.isActive, true), isNotNull(attendance.id))),
    )
    .orderBy(asc(employees.name));
  return rows.map((row) => ({ ...row, timeIn: hhmm(row.timeIn), timeOut: hhmm(row.timeOut) }));
}

/** Every row in a month, for `summariseMonth`. People are the active register plus anyone with a row. */
export async function readMonth(
  first: string,
  last: string,
): Promise<{
  people: { id: string; name: string }[];
  rows: (MonthRow & { readonly businessDate: string })[];
}> {
  const rows = await dbRead()
    .select({
      employeeId: attendance.employeeId,
      businessDate: attendance.businessDate,
      name: employees.name,
      status: attendance.status,
      timeIn: attendance.timeIn,
      timeOut: attendance.timeOut,
    })
    .from(attendance)
    .innerJoin(employees, eq(employees.id, attendance.employeeId))
    .where(and(between(attendance.businessDate, first, last), isNull(attendance.deletedAt)));

  const people = new Map<string, string>();
  for (const person of await readEmployees())
    if (person.isActive) people.set(person.id, person.name);
  for (const row of rows) people.set(row.employeeId, row.name);

  return {
    people: [...people]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    rows: rows.map((row) => ({
      employeeId: row.employeeId,
      businessDate: row.businessDate,
      status: row.status,
      timeIn: hhmm(row.timeIn),
      timeOut: hhmm(row.timeOut),
    })),
  };
}

/**
 * Each person's most recent times in and out, from the last sixty days —
 * what "Present" fills in for them, so a manager marking the usual 16:00 to
 * 01:30 does not type it again every day. A suggestion on the form only; what
 * is saved is whatever is in the boxes when the register is saved.
 */
export async function readUsualTimes(
  before: string,
): Promise<Map<string, { timeIn: string; timeOut: string | null }>> {
  const since = new Date(`${before}T12:00:00Z`);
  since.setUTCDate(since.getUTCDate() - 60);
  const rows = await dbRead()
    .selectDistinctOn([attendance.employeeId], {
      employeeId: attendance.employeeId,
      timeIn: attendance.timeIn,
      timeOut: attendance.timeOut,
    })
    .from(attendance)
    .where(
      and(
        isNull(attendance.deletedAt),
        isNotNull(attendance.timeIn),
        gte(attendance.businessDate, since.toISOString().slice(0, 10)),
      ),
    )
    .orderBy(attendance.employeeId, desc(attendance.businessDate));
  const usual = new Map<string, { timeIn: string; timeOut: string | null }>();
  for (const row of rows) {
    const timeIn = hhmm(row.timeIn);
    if (timeIn !== null) usual.set(row.employeeId, { timeIn, timeOut: hhmm(row.timeOut) });
  }
  return usual;
}
