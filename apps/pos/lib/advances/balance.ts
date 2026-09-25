import { subtract, sum, type Paisa } from '@natech/domain';

/**
 * The staff advance book's rules — ADR 0033, docs/runfiles/M27-staff-advances.md.
 *
 * Pure, and apart from `actions.ts` for the same reason as
 * `lib/attendance/register.ts`: the action is `server-only`, and the rules are
 * the part worth testing without a database. The action asks `refuseEntry`
 * once, inside its transaction, with the balance it read under `FOR UPDATE`.
 */

export type AdvanceKind = 'ADVANCE' | 'RECOVERY';
export type RecoveryMethod = 'SALARY_DEDUCTION' | 'CASH_RETURN';

export const METHOD_LABEL: Record<RecoveryMethod, string> = {
  SALARY_DEDUCTION: 'Deducted from salary',
  CASH_RETURN: 'Paid back in cash',
};

export interface AdvanceAmounts {
  readonly advanced: Paisa;
  readonly recovered: Paisa;
  /** What the employee still owes. Derived, never stored (ADR 0033). */
  readonly outstanding: Paisa;
}

export function advanceBalance(
  entries: readonly { readonly kind: AdvanceKind; readonly amount: Paisa }[],
): AdvanceAmounts {
  const advanced = sum(entries.filter((e) => e.kind === 'ADVANCE').map((e) => e.amount));
  const recovered = sum(entries.filter((e) => e.kind === 'RECOVERY').map((e) => e.amount));
  return { advanced, recovered, outstanding: subtract(advanced, recovered) };
}

export interface EntryRequest {
  readonly kind: AdvanceKind;
  readonly method: RecoveryMethod | null;
  readonly amount: Paisa;
  readonly fromTill: boolean;
  readonly occurredOn: string;
  /** Today's business date, per the outlet's cutoff. */
  readonly today: string;
  /** Outstanding before this entry. */
  readonly outstanding: Paisa;
  readonly employeeActive: boolean;
}

/** Null when the entry may be written; otherwise the sentence to show. */
export function refuseEntry(entry: EntryRequest): string | null {
  if (entry.amount <= 0n) return 'Enter an amount greater than zero.';
  if (entry.occurredOn > entry.today) return 'An entry cannot be dated in the future.';

  if (entry.kind === 'ADVANCE') {
    if (entry.method !== null) return 'An advance has no recovery method.';
    // Somebody who has left cannot be advanced against a salary they will
    // not be paid. They can still pay back what they owe, below.
    if (!entry.employeeActive) return 'This person is no longer on the register.';
  } else {
    if (entry.method === null) return 'Choose how the money came back.';
    // Over-recovery would leave the restaurant owing the employee through a
    // book that only knows advances — a negative balance nobody can explain.
    if (entry.amount > entry.outstanding)
      return 'That is more than this person owes. Check the outstanding balance.';
    if (entry.fromTill && entry.method === 'SALARY_DEDUCTION')
      return 'A salary deduction does not go through the till.';
  }

  // The drawer is tonight's. A movement in it dated last week would make the
  // shift and the book disagree about when the cash moved.
  if (entry.fromTill && entry.occurredOn !== entry.today)
    return 'Cash through the till must be dated today.';
  return null;
}
