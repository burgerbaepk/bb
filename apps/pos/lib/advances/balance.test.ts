import { describe, expect, it } from 'vitest';
import { parsePaisa } from '@natech/domain';
import { advanceBalance, refuseEntry, type EntryRequest } from './balance';

/**
 * The staff advance book — ADR 0033, docs/runfiles/M27-staff-advances.md §4.
 *
 * Asserted against the notebook: the figures are what a manager would write
 * down for the same month.
 */

const rs = parsePaisa;

describe('balance (gate 1)', () => {
  it('is advances less recoveries, in exact paisa', () => {
    const { advanced, recovered, outstanding } = advanceBalance([
      { kind: 'ADVANCE', amount: rs('5000.00') },
      { kind: 'ADVANCE', amount: rs('1500.50') },
      { kind: 'RECOVERY', amount: rs('2000.25') },
    ]);
    expect(advanced).toBe(rs('6500.50'));
    expect(recovered).toBe(rs('2000.25'));
    expect(outstanding).toBe(rs('4500.25'));
  });

  it('is zero with no entries', () => {
    expect(advanceBalance([]).outstanding).toBe(0n);
  });
});

const request = (over: Partial<EntryRequest>): EntryRequest => ({
  kind: 'ADVANCE',
  method: null,
  amount: rs('3000.00'),
  fromTill: false,
  occurredOn: '2026-09-25',
  today: '2026-09-25',
  outstanding: rs('0.00'),
  employeeActive: true,
  ...over,
});

describe('entry rules (gate 2)', () => {
  it('accepts an ordinary advance from the till today', () => {
    expect(refuseEntry(request({ fromTill: true }))).toBeNull();
  });

  it('accepts a recovery of exactly the balance, and refuses one paisa more', () => {
    const owed = rs('3000.00');
    const recovery = { kind: 'RECOVERY', method: 'SALARY_DEDUCTION', outstanding: owed } as const;
    expect(refuseEntry(request({ ...recovery, amount: owed }))).toBeNull();
    expect(refuseEntry(request({ ...recovery, amount: rs('3000.01') }))).toMatch(/more than/);
  });

  it('lets a leaver pay back, but not be advanced', () => {
    expect(refuseEntry(request({ employeeActive: false }))).toMatch(/no longer/);
    expect(
      refuseEntry(
        request({
          kind: 'RECOVERY',
          method: 'CASH_RETURN',
          outstanding: rs('3000.00'),
          employeeActive: false,
        }),
      ),
    ).toBeNull();
  });

  it('refuses the till for a deduction, and a till entry not dated today', () => {
    expect(
      refuseEntry(
        request({
          kind: 'RECOVERY',
          method: 'SALARY_DEDUCTION',
          outstanding: rs('5000.00'),
          fromTill: true,
        }),
      ),
    ).toMatch(/does not go through the till/);
    expect(refuseEntry(request({ fromTill: true, occurredOn: '2026-09-20' }))).toMatch(/today/);
    // Off the till, a back-dated advance is the notebook being caught up.
    expect(refuseEntry(request({ occurredOn: '2026-09-20' }))).toBeNull();
  });

  it('refuses zero, the future, and a recovery with no method', () => {
    expect(refuseEntry(request({ amount: rs('0.00') }))).toMatch(/greater than zero/);
    expect(refuseEntry(request({ occurredOn: '2026-09-26' }))).toMatch(/future/);
    expect(
      refuseEntry(request({ kind: 'RECOVERY', method: null, outstanding: rs('10.00') })),
    ).toMatch(/how the money/);
  });
});
