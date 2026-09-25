import 'server-only';
import { and, desc, eq, gte, isNull } from 'drizzle-orm';
import { dbRead, employees, staffAdvances, users } from '@natech/db';
import { paisa, type Paisa } from '@natech/domain';
import {
  advanceBalance,
  type AdvanceAmounts,
  type AdvanceKind,
  type RecoveryMethod,
} from './balance';

/**
 * The staff advance book — ADR 0033. Reads only, through `dbRead` (R2).
 */

export interface AdvancePerson extends AdvanceAmounts {
  readonly employeeId: string;
  readonly name: string;
  readonly isActive: boolean;
}

export interface AdvanceEntryRow {
  readonly id: string;
  readonly occurredOn: string;
  readonly name: string;
  readonly kind: AdvanceKind;
  readonly method: RecoveryMethod | null;
  readonly amount: Paisa;
  readonly throughTill: boolean;
  readonly note: string | null;
  readonly recordedBy: string | null;
}

/**
 * Everyone who is active or still owes something, with their balance.
 *
 * Every entry ever is read and summed here through the same `advanceBalance`
 * the action checks against, so the screen and the refusal cannot disagree.
 * ponytail: all-time rows per render — a few thousand a year for one
 * restaurant; move the sum into SQL if the page ever slows.
 */
export async function readAdvanceBalances(): Promise<AdvancePerson[]> {
  const [people, entries] = await Promise.all([
    dbRead()
      .select({ id: employees.id, name: employees.name, isActive: employees.isActive })
      .from(employees)
      .where(isNull(employees.deletedAt))
      .orderBy(employees.name),
    dbRead()
      .select({
        employeeId: staffAdvances.employeeId,
        kind: staffAdvances.kind,
        amount: staffAdvances.amount,
      })
      .from(staffAdvances)
      .where(isNull(staffAdvances.deletedAt)),
  ]);
  return people
    .map((person) => ({
      employeeId: person.id,
      name: person.name,
      isActive: person.isActive,
      ...advanceBalance(
        entries
          .filter((entry) => entry.employeeId === person.id)
          .map((entry) => ({ kind: entry.kind, amount: paisa(entry.amount) })),
      ),
    }))
    .filter((person) => person.isActive || person.outstanding !== 0n);
}

export async function readAdvanceEntries(from: string): Promise<AdvanceEntryRow[]> {
  const rows = await dbRead()
    .select({
      id: staffAdvances.id,
      occurredOn: staffAdvances.occurredOn,
      name: employees.name,
      kind: staffAdvances.kind,
      method: staffAdvances.method,
      amount: staffAdvances.amount,
      cashMovementId: staffAdvances.cashMovementId,
      note: staffAdvances.note,
      recordedBy: users.displayName,
    })
    .from(staffAdvances)
    .innerJoin(employees, eq(employees.id, staffAdvances.employeeId))
    .leftJoin(users, eq(users.id, staffAdvances.recordedBy))
    .where(and(gte(staffAdvances.occurredOn, from), isNull(staffAdvances.deletedAt)))
    .orderBy(desc(staffAdvances.occurredOn), desc(staffAdvances.createdAt));
  return rows.map(({ cashMovementId, amount, ...row }) => ({
    ...row,
    amount: paisa(amount),
    throughTill: cashMovementId !== null,
  }));
}
