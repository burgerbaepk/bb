import { describe, expect, it } from 'vitest';
import {
  collectRegister,
  daysElapsed,
  formatHours,
  monthBounds,
  summariseMonth,
  workedMinutes,
  type RegisterEntry,
} from './register';

/**
 * The attendance book — ADR 0032, docs/runfiles/M26-attendance.md §4.
 *
 * Asserted against what a manager would work out from the paper register for
 * the same day, not against the implementation.
 */

const entry = (over: Partial<RegisterEntry>): RegisterEntry => ({
  employeeId: 'e1',
  name: 'Bilal',
  status: '',
  timeIn: '',
  timeOut: '',
  note: '',
  ...over,
});

describe('worked time (gate 1, R13)', () => {
  it('wraps a closing shift past midnight instead of going negative', () => {
    expect(workedMinutes('16:00', '01:30')).toBe(570);
    expect(formatHours(570)).toBe('9h 30m');
  });

  it('is plain subtraction within a day', () => {
    expect(workedMinutes('09:15', '17:45')).toBe(510);
  });

  it('is zero, never negative, for equal times and null while a time is missing', () => {
    expect(workedMinutes('12:00', '12:00')).toBe(0);
    expect(workedMinutes('12:00', null)).toBeNull();
    expect(formatHours(-30)).toBe('0h 00m');
  });
});

describe('collecting a posted register (gate 2)', () => {
  it('accepts a present day with times, normalising seconds away', () => {
    const { marks, errors } = collectRegister([
      entry({ status: 'PRESENT', timeIn: '16:00:00', timeOut: '01:30' }),
    ]);
    expect(errors).toEqual([]);
    expect(marks).toEqual([
      { employeeId: 'e1', status: 'PRESENT', timeIn: '16:00', timeOut: '01:30', note: null },
    ]);
  });

  it('treats a blank row as unmarked', () => {
    expect(collectRegister([entry({})]).marks[0]?.status).toBeNull();
  });

  it('refuses by name: unknown status, times on an absence, bad time, out without in', () => {
    const { marks, errors } = collectRegister([
      entry({ name: 'Asad', status: 'LATE' }),
      entry({ name: 'Hina', status: 'ABSENT', timeIn: '10:00' }),
      entry({ name: 'Omar', status: 'PRESENT', timeIn: '25:00' }),
      entry({ name: 'Zara', status: 'PRESENT', timeOut: '22:00' }),
      entry({ name: 'Ali', timeIn: '10:00' }),
    ]);
    expect(marks).toEqual([]);
    expect(errors).toEqual([
      'Asad: "LATE" is not a status.',
      'Hina: times only belong on a present day.',
      'Omar: enter times as HH:MM.',
      'Zara: a time out needs a time in.',
      'Ali: choose a status, or clear the times.',
    ]);
  });
});

describe('the month (gate 3, R16)', () => {
  it('counts only the rows it was given and reports the unmarked days', () => {
    const [bilal, hina] = summariseMonth(
      [
        { id: 'b', name: 'Bilal' },
        { id: 'h', name: 'Hina' },
      ],
      [
        { employeeId: 'b', status: 'PRESENT', timeIn: '16:00', timeOut: '01:30' },
        { employeeId: 'b', status: 'PRESENT', timeIn: '16:00', timeOut: null },
        { employeeId: 'b', status: 'OFF', timeIn: null, timeOut: null },
        { employeeId: 'h', status: 'ABSENT', timeIn: null, timeOut: null },
      ],
      5,
    );
    expect(bilal?.counts).toEqual({ PRESENT: 2, ABSENT: 0, LEAVE: 0, OFF: 1 });
    expect(bilal?.minutes).toBe(570);
    expect(bilal?.unmarked).toBe(2);
    expect(hina?.unmarked).toBe(4);
  });

  it('knows how much of a month has happened', () => {
    expect(daysElapsed('2026-09', '2026-09-25')).toBe(25);
    expect(daysElapsed('2026-02', '2026-09-25')).toBe(28);
    expect(daysElapsed('2024-02', '2026-09-25')).toBe(29);
    expect(daysElapsed('2026-10', '2026-09-25')).toBe(0);
    expect(monthBounds('2024-02')).toEqual({ first: '2024-02-01', last: '2024-02-29' });
  });
});
