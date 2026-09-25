/**
 * The attendance book's arithmetic — ADR 0032, docs/runfiles/M26-attendance.md.
 *
 * Pure, and apart from `queries.ts` and `actions.ts` for the same reason as
 * `lib/demand/grid.ts`: those modules are `server-only`, and this is the branchy
 * part worth testing without a database.
 */

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LEAVE', 'OFF'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: 'Present',
  ABSENT: 'Absent',
  LEAVE: 'Leave',
  OFF: 'Day off',
};

/** One person's row exactly as the register form posted it. */
export interface RegisterEntry {
  readonly employeeId: string;
  readonly name: string;
  readonly status: string;
  readonly timeIn: string;
  readonly timeOut: string;
  readonly note: string;
}

/** A validated row. `status: null` means the box was left blank — not marked. */
export interface RegisterMark {
  readonly employeeId: string;
  readonly status: AttendanceStatus | null;
  readonly timeIn: string | null;
  readonly timeOut: string | null;
  readonly note: string | null;
}

const isStatus = (value: string): value is AttendanceStatus =>
  (ATTENDANCE_STATUSES as readonly string[]).includes(value);

/**
 * `HH:MM`, from what a `<input type="time">` posts or what a Postgres `time`
 * column returns (`HH:MM:SS`). Seconds are dropped: the paper book has none,
 * and keeping them would make an unedited row compare unequal to its own save.
 */
export function normaliseTime(raw: string): string | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(raw.trim());
  if (match === null) return null;
  const [, hh = '', mm = ''] = match;
  if (Number(hh) > 23 || Number(mm) > 59) return null;
  return `${hh}:${mm}`;
}

export function collectRegister(entries: readonly RegisterEntry[]): {
  readonly marks: readonly RegisterMark[];
  readonly errors: readonly string[];
} {
  const marks: RegisterMark[] = [];
  const errors: string[] = [];

  for (const entry of entries) {
    const status = entry.status.trim();
    const rawIn = entry.timeIn.trim();
    const rawOut = entry.timeOut.trim();
    const note = entry.note.trim();

    if (status === '') {
      // A time typed against a blank status is a forgotten status, not a
      // decision to leave the day unmarked. Refusing it is cheaper than
      // silently dropping the times the manager just typed.
      if (rawIn !== '' || rawOut !== '')
        errors.push(`${entry.name}: choose a status, or clear the times.`);
      else
        marks.push({
          employeeId: entry.employeeId,
          status: null,
          timeIn: null,
          timeOut: null,
          note: null,
        });
      continue;
    }
    // Named, not indexed — the same reasoning as the demand grid.
    if (!isStatus(status)) {
      errors.push(`${entry.name}: "${status}" is not a status.`);
      continue;
    }
    if (status !== 'PRESENT' && (rawIn !== '' || rawOut !== '')) {
      errors.push(`${entry.name}: times only belong on a present day.`);
      continue;
    }
    const timeIn = rawIn === '' ? null : normaliseTime(rawIn);
    const timeOut = rawOut === '' ? null : normaliseTime(rawOut);
    if ((rawIn !== '' && timeIn === null) || (rawOut !== '' && timeOut === null)) {
      errors.push(`${entry.name}: enter times as HH:MM.`);
      continue;
    }
    // In without out is someone still on shift. Out without in is a typo.
    if (timeIn === null && timeOut !== null) {
      errors.push(`${entry.name}: a time out needs a time in.`);
      continue;
    }
    if (note.length > 240) {
      errors.push(`${entry.name}: the note is longer than 240 characters.`);
      continue;
    }
    marks.push({
      employeeId: entry.employeeId,
      status,
      timeIn,
      timeOut,
      note: note === '' ? null : note,
    });
  }
  return { marks, errors };
}

const toMinutes = (hhmm: string): number => {
  const [hh = '0', mm = '0'] = hhmm.split(':');
  return Number(hh) * 60 + Number(mm);
};

/**
 * Minutes worked, or null while either time is missing.
 *
 * R13. The restaurant closes after midnight, so 16:00 in and 01:30 out is the
 * ordinary closing shift, not a negative nine and a half hours. A time out
 * earlier than the time in is the next morning; the modulo is the whole rule,
 * and it cannot produce a negative.
 */
export function workedMinutes(timeIn: string | null, timeOut: string | null): number | null {
  if (timeIn === null || timeOut === null) return null;
  return (toMinutes(timeOut) - toMinutes(timeIn) + 1440) % 1440;
}

export function formatHours(minutes: number): string {
  const safe = Math.max(0, Math.floor(minutes));
  return `${Math.floor(safe / 60)}h ${String(safe % 60).padStart(2, '0')}m`;
}

/** Days in `month` (`YYYY-MM`) that have happened by `today` (`YYYY-MM-DD`). */
export function daysElapsed(month: string, today: string): number {
  const current = today.slice(0, 7);
  if (month > current) return 0;
  if (month === current) return Number(today.slice(8, 10));
  const [year = 0, mon = 0] = month.split('-').map(Number);
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, mon, 0)).getUTCDate();
}

/** First and last business date of `month` (`YYYY-MM`), inclusive. */
export function monthBounds(month: string): { first: string; last: string } {
  const [year = 0, mon = 0] = month.split('-').map(Number);
  return {
    first: `${month}-01`,
    last: new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10),
  };
}

export interface MonthRow {
  readonly employeeId: string;
  readonly status: AttendanceStatus;
  readonly timeIn: string | null;
  readonly timeOut: string | null;
}

export interface MonthSummary {
  readonly employeeId: string;
  readonly name: string;
  readonly counts: Record<AttendanceStatus, number>;
  /** Days so far this month with no row. The gap the owner needs to chase. */
  readonly unmarked: number;
  readonly minutes: number;
}

/**
 * R16 — every figure here is a count over `rows`, the same rows the screen was
 * given, so the summary cannot disagree with the register it summarises.
 */
export function summariseMonth(
  people: readonly { readonly id: string; readonly name: string }[],
  rows: readonly MonthRow[],
  elapsed: number,
): MonthSummary[] {
  return people.map((person) => {
    const mine = rows.filter((row) => row.employeeId === person.id);
    const counts: Record<AttendanceStatus, number> = { PRESENT: 0, ABSENT: 0, LEAVE: 0, OFF: 0 };
    let minutes = 0;
    for (const row of mine) {
      counts[row.status] += 1;
      minutes += workedMinutes(row.timeIn, row.timeOut) ?? 0;
    }
    return {
      employeeId: person.id,
      name: person.name,
      counts,
      unmarked: Math.max(0, elapsed - mine.length),
      minutes,
    };
  });
}
