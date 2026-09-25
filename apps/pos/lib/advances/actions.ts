'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { cashMovements, dbWrite, employees, shifts, staffAdvances, writeAudit } from '@natech/db';
import { paisa, parsePaisa, type Paisa } from '@natech/domain';
import { assertPermission, requestContext, requireOperator } from '../auth/session';
import { currentBusinessDate } from '../orders/businessDate';
import { advanceBalance, refuseEntry } from './balance';

/**
 * The staff advance book — ADR 0033, docs/runfiles/M27-staff-advances.md.
 *
 * `expenses.write`, as M23 and M26: OWNER and MANAGER. The register of people
 * is `staff.write`, owner-only (ADR 0032), so a manager can pay an advance but
 * cannot create the person it is paid to.
 *
 * One action for all four shapes of entry (runfile §3). Everything — the lock,
 * the balance, the rules, the till movement, both audit rows — happens in one
 * `dbWrite` transaction (R2, R7), so an advance cannot exist without its
 * `PAY_OUT`, nor a `PAY_OUT` without its advance.
 */

export interface AdvanceActionState {
  readonly error: string | null;
  readonly message: string | null;
}

const EntryInput = z.object({
  employeeId: z.uuid('Choose a person.'),
  kind: z.enum(['ADVANCE', 'RECOVERY']),
  method: z.enum(['SALARY_DEDUCTION', 'CASH_RETURN']).nullable(),
  amount: z.string().trim().min(1, 'Enter an amount.'),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date.'),
  fromTill: z.boolean(),
  note: z.string().trim().max(240).nullable(),
});

const optional = (value: FormDataEntryValue | null): string | null => {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
};

/** A refusal decided inside the transaction; rolls it back and becomes the message. */
class Refusal extends Error {}

export async function recordAdvanceEntryAction(
  _previous: AdvanceActionState,
  form: FormData,
): Promise<AdvanceActionState> {
  const operator = await requireOperator();
  assertPermission(operator, 'expenses.write');
  const kind = form.get('kind');
  const parsed = EntryInput.safeParse({
    employeeId: form.get('employeeId'),
    kind,
    // An advance has no method whatever the form sent; the CHECK agrees.
    method: kind === 'RECOVERY' ? optional(form.get('method')) : null,
    amount: form.get('amount'),
    occurredOn: form.get('occurredOn'),
    fromTill: form.get('fromTill') === 'on',
    note: optional(form.get('note')),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Check the entry.', message: null };
  const input = parsed.data;

  let amount: Paisa;
  try {
    amount = parsePaisa(input.amount);
  } catch {
    return { error: 'Enter an amount in rupees, e.g. 5000 or 2500.50.', message: null };
  }

  const context = await requestContext();
  const audit = { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined };

  try {
    const name = await dbWrite().transaction(async (tx) => {
      // The lock that makes the balance check true. Two recoveries saved at
      // once each read the balance; without this both pass and the book goes
      // negative. `FOR UPDATE` on the person serialises every entry for them.
      const [person] = await tx
        .select({ name: employees.name, isActive: employees.isActive })
        .from(employees)
        .where(and(eq(employees.id, input.employeeId), isNull(employees.deletedAt)))
        .for('update');
      if (person === undefined) throw new Refusal('That person is not on the register.');

      const entries = await tx
        .select({ kind: staffAdvances.kind, amount: staffAdvances.amount })
        .from(staffAdvances)
        .where(
          and(eq(staffAdvances.employeeId, input.employeeId), isNull(staffAdvances.deletedAt)),
        );
      const refusal = refuseEntry({
        kind: input.kind,
        method: input.method,
        amount,
        fromTill: input.fromTill,
        occurredOn: input.occurredOn,
        today: await currentBusinessDate(tx),
        outstanding: advanceBalance(entries.map((e) => ({ kind: e.kind, amount: paisa(e.amount) })))
          .outstanding,
        employeeActive: person.isActive,
      });
      if (refusal !== null) throw new Refusal(refusal);

      let cashMovementId: string | null = null;
      if (input.fromTill) {
        // Locked so the drawer cannot close between this read and the insert.
        const [shift] = await tx
          .select({ id: shifts.id })
          .from(shifts)
          .where(eq(shifts.status, 'OPEN'))
          .for('update');
        if (shift === undefined)
          throw new Refusal('No shift is open, so the till cannot have paid this. Open one first.');
        const type = input.kind === 'ADVANCE' ? 'PAY_OUT' : 'PAY_IN';
        const reason =
          input.kind === 'ADVANCE'
            ? `Staff advance — ${person.name}`
            : `Advance returned — ${person.name}`;
        const [movement] = await tx
          .insert(cashMovements)
          .values({ shiftId: shift.id, type, amount, reason, actorId: operator.id })
          .returning({ id: cashMovements.id });
        if (movement === undefined) throw new Error('Recording the till movement returned no row.');
        // Audited exactly as `recordCashMovementAction` audits one, so the
        // activity log reads the same whichever screen moved the cash.
        await writeAudit(tx, audit, {
          entity: 'cash_movements',
          entityId: movement.id,
          action: type,
          after: { shiftId: shift.id, amount: amount.toString(), reason },
        });
        cashMovementId = movement.id;
      }

      const [created] = await tx
        .insert(staffAdvances)
        .values({
          employeeId: input.employeeId,
          kind: input.kind,
          method: input.method,
          amount,
          occurredOn: input.occurredOn,
          cashMovementId,
          note: input.note,
          recordedBy: operator.id,
        })
        .returning({ id: staffAdvances.id });
      if (created === undefined) throw new Error('Recording the advance returned no row.');
      await writeAudit(tx, audit, {
        entity: 'staff_advances',
        entityId: created.id,
        action: input.kind === 'ADVANCE' ? 'STAFF_ADVANCE_PAID' : 'STAFF_ADVANCE_RECOVERED',
        after: {
          employeeId: input.employeeId,
          method: input.method,
          amount: amount.toString(),
          occurredOn: input.occurredOn,
          cashMovementId,
        },
      });
      return person.name;
    });

    revalidatePath('/admin/advances');
    if (input.fromTill) {
      revalidatePath('/shift');
      revalidatePath('/admin/shift');
    }
    return {
      error: null,
      message:
        input.kind === 'ADVANCE'
          ? `Advance to ${name} recorded${input.fromTill ? ' and taken from the till' : ''}.`
          : `Recovery from ${name} recorded${input.fromTill ? ' and added to the till' : ''}.`,
    };
  } catch (error) {
    if (error instanceof Refusal) return { error: error.message, message: null };
    throw error;
  }
}
