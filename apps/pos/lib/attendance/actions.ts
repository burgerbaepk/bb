'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { attendance, dbWrite, employees, writeAudit, type AuditContext } from '@natech/db';
import { assertPermission, requestContext, requireOperator } from '../auth/session';
import { currentBusinessDate } from '../orders/businessDate';
import { collectRegister, normaliseTime } from './register';

/**
 * Staff register and attendance mutations — ADR 0032,
 * docs/runfiles/M26-attendance.md.
 *
 * Two grants, deliberately different. The register of people is `staff.write`,
 * owner-only, so the hand that pays advances (M27) cannot also invent the
 * person being paid. The daily book is `expenses.write`, the manager's grant
 * for operating records since M23, which a cashier does not hold — nobody at
 * the till marks their own attendance.
 *
 * Every write is `dbWrite` in a transaction with its audit row inside it
 * (R2, R7).
 */

export interface AttendanceActionState {
  readonly error: string | null;
  readonly message: string | null;
}

const optional = (value: FormDataEntryValue | null): string | null => {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
};

const EmployeeInput = z.object({
  name: z.string().trim().min(2, 'Enter the person’s name.').max(120),
  jobTitle: z.string().trim().max(60).nullable(),
  phone: z.string().trim().max(30).nullable(),
});

const DateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Save one day of the book.
 *
 * The form posts a status, two times and a note per person, keyed by employee
 * id. Only people whose status box is actually on the form are touched, so a
 * register rendered before somebody was added cannot clear that person's row.
 * Names come from the database, never the payload, for the same reason the
 * demand grid reads its catalogue inside the transaction.
 *
 * No idempotency key (R3), and ADR 0032 says why: each row is keyed on
 * `(employee, date)` and compared before it is written, so a replayed form
 * converges on the same state and writes no second audit row.
 */
export async function saveAttendanceAction(
  businessDate: string,
  _previous: AttendanceActionState,
  form: FormData,
): Promise<AttendanceActionState> {
  const operator = await requireOperator();
  assertPermission(operator, 'expenses.write');
  if (!DateInput.safeParse(businessDate).success)
    return { error: 'Choose a date for the register.', message: null };

  const context = await requestContext();
  const audit = { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined };

  const outcome = await saveDay(businessDate, operator.id, audit, form).catch((error: unknown) => {
    // Two managers saving the same day: the partial unique index on
    // `(employee_id, business_date)` refuses the second insert. Drizzle wraps
    // the driver error, so the Postgres code may be on `cause`.
    const code = (e: unknown): unknown =>
      typeof e === 'object' && e !== null && 'code' in e ? e.code : undefined;
    const cause =
      typeof error === 'object' && error !== null && 'cause' in error ? error.cause : undefined;
    if (code(error) === '23505' || code(cause) === '23505') return 'conflict' as const;
    throw error;
  });

  if (outcome === 'conflict')
    return {
      error: 'Somebody else saved this day at the same moment. Reopen the day and check it.',
      message: null,
    };
  if (outcome === 'future')
    return { error: 'Attendance cannot be marked for a day that has not happened.', message: null };
  if ('bad' in outcome) return { error: outcome.bad, message: null };
  revalidatePath('/admin/attendance');
  const { marked, edited, cleared } = outcome;
  if (marked + edited + cleared === 0) return { error: null, message: 'Nothing had changed.' };
  return {
    error: null,
    message: `Saved — ${marked} marked, ${edited} changed, ${cleared} cleared.`,
  };
}

/** The whole day in one transaction, so a refused row leaves nothing half-saved. */
async function saveDay(
  businessDate: string,
  operatorId: string,
  audit: AuditContext,
  form: FormData,
) {
  return dbWrite().transaction(async (tx) => {
    // ADR 0032 — a register filled in ahead of time records nothing that
    // happened. Decided inside the transaction, against the outlet's cutoff.
    if (businessDate > (await currentBusinessDate(tx))) return 'future' as const;

    const people = await tx
      .select({ id: employees.id, name: employees.name })
      .from(employees)
      .where(isNull(employees.deletedAt));
    const { marks, errors } = collectRegister(
      people
        .filter((person) => form.has(`status:${person.id}`))
        .map((person) => ({
          employeeId: person.id,
          name: person.name,
          status: String(form.get(`status:${person.id}`) ?? ''),
          timeIn: String(form.get(`in:${person.id}`) ?? ''),
          timeOut: String(form.get(`out:${person.id}`) ?? ''),
          note: String(form.get(`note:${person.id}`) ?? ''),
        })),
    );
    if (errors.length > 0) return { bad: errors.slice(0, 3).join(' ') } as const;

    const existing = new Map(
      (
        await tx
          .select({
            id: attendance.id,
            employeeId: attendance.employeeId,
            status: attendance.status,
            timeIn: attendance.timeIn,
            timeOut: attendance.timeOut,
            note: attendance.note,
          })
          .from(attendance)
          .where(and(eq(attendance.businessDate, businessDate), isNull(attendance.deletedAt)))
      ).map((row) => [
        row.employeeId,
        {
          ...row,
          timeIn: row.timeIn === null ? null : normaliseTime(row.timeIn),
          timeOut: row.timeOut === null ? null : normaliseTime(row.timeOut),
        },
      ]),
    );

    let marked = 0;
    let edited = 0;
    let cleared = 0;
    for (const mark of marks) {
      const before = existing.get(mark.employeeId);
      const after = {
        status: mark.status,
        timeIn: mark.timeIn,
        timeOut: mark.timeOut,
        note: mark.note,
      };

      if (mark.status === null) {
        if (before === undefined) continue;
        await tx
          .update(attendance)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(attendance.id, before.id));
        await writeAudit(tx, audit, {
          entity: 'attendance',
          entityId: before.id,
          action: 'ATTENDANCE_CLEARED',
          before: { businessDate, ...before },
        });
        cleared += 1;
        continue;
      }

      const status = mark.status;
      if (before === undefined) {
        const [created] = await tx
          .insert(attendance)
          .values({
            employeeId: mark.employeeId,
            businessDate,
            status,
            timeIn: mark.timeIn,
            timeOut: mark.timeOut,
            note: mark.note,
            recordedBy: operatorId,
          })
          .returning({ id: attendance.id });
        if (created === undefined) throw new Error('Marking attendance returned no row.');
        await writeAudit(tx, audit, {
          entity: 'attendance',
          entityId: created.id,
          action: 'ATTENDANCE_MARKED',
          after: { businessDate, employeeId: mark.employeeId, ...after },
        });
        marked += 1;
        continue;
      }

      // Unchanged rows write nothing: the trail should show what changed on
      // the day, not fifteen rows of "still present".
      if (
        before.status === status &&
        before.timeIn === mark.timeIn &&
        before.timeOut === mark.timeOut &&
        before.note === mark.note
      )
        continue;
      await tx
        .update(attendance)
        .set({
          status,
          timeIn: mark.timeIn,
          timeOut: mark.timeOut,
          note: mark.note,
          recordedBy: operatorId,
          updatedAt: new Date(),
        })
        .where(eq(attendance.id, before.id));
      await writeAudit(tx, audit, {
        entity: 'attendance',
        entityId: before.id,
        action: 'ATTENDANCE_CHANGED',
        before: {
          businessDate,
          status: before.status,
          timeIn: before.timeIn,
          timeOut: before.timeOut,
          note: before.note,
        },
        after: { businessDate, ...after },
      });
      edited += 1;
    }
    return { marked, edited, cleared } as const;
  });
}

export async function createEmployeeAction(
  _previous: AttendanceActionState,
  form: FormData,
): Promise<AttendanceActionState> {
  const operator = await requireOperator();
  assertPermission(operator, 'staff.write');
  const parsed = EmployeeInput.safeParse({
    name: form.get('name'),
    jobTitle: optional(form.get('jobTitle')),
    phone: optional(form.get('phone')),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Check the details.', message: null };

  const context = await requestContext();
  await dbWrite().transaction(async (tx) => {
    const [created] = await tx
      .insert(employees)
      .values(parsed.data)
      .returning({ id: employees.id });
    if (created === undefined) throw new Error('Adding the employee returned no row.');
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      { entity: 'employees', entityId: created.id, action: 'EMPLOYEE_CREATED', after: parsed.data },
    );
  });
  revalidatePath('/admin/employees');
  revalidatePath('/admin/attendance');
  return { error: null, message: `${parsed.data.name} added to the register.` };
}

export async function updateEmployeeAction(
  id: string,
  _previous: AttendanceActionState,
  form: FormData,
): Promise<AttendanceActionState> {
  const operator = await requireOperator();
  assertPermission(operator, 'staff.write');
  const parsed = EmployeeInput.safeParse({
    name: form.get('name'),
    jobTitle: optional(form.get('jobTitle')),
    phone: optional(form.get('phone')),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Check the details.', message: null };
  return writeEmployee(operator.id, id, parsed.data, 'EMPLOYEE_UPDATED');
}

/**
 * Deactivate rather than delete. A person who has left still has a month of
 * attendance, and in M27 possibly an advance outstanding; soft-deleting them
 * would orphan both from the screens that read them.
 */
export async function setEmployeeActiveAction(id: string, isActive: boolean): Promise<void> {
  const operator = await requireOperator();
  assertPermission(operator, 'staff.write');
  await writeEmployee(
    operator.id,
    id,
    { isActive },
    isActive ? 'EMPLOYEE_REACTIVATED' : 'EMPLOYEE_DEACTIVATED',
  );
}

async function writeEmployee(
  actorId: string,
  id: string,
  change: Partial<z.infer<typeof EmployeeInput> & { isActive: boolean }>,
  action: string,
): Promise<AttendanceActionState> {
  const context = await requestContext();
  const found = await dbWrite().transaction(async (tx) => {
    const [before] = await tx
      .select({
        name: employees.name,
        jobTitle: employees.jobTitle,
        phone: employees.phone,
        isActive: employees.isActive,
      })
      .from(employees)
      .where(and(eq(employees.id, id), isNull(employees.deletedAt)));
    if (before === undefined) return false;
    await tx
      .update(employees)
      .set({ ...change, updatedAt: new Date() })
      .where(eq(employees.id, id));
    await writeAudit(
      tx,
      { actorId, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      { entity: 'employees', entityId: id, action, before, after: change },
    );
    return true;
  });
  if (!found) return { error: 'That person is no longer on the register.', message: null };
  revalidatePath('/admin/employees');
  revalidatePath('/admin/attendance');
  return { error: null, message: 'Saved.' };
}
