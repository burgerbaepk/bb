'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { dbWrite, roles, userRoles, users, writeAudit } from '@natech/db';
import { hashSecret, isGuessablePin } from '@natech/auth';
import { RoleKeySchema } from '@natech/contracts';
import { assertPermission, requestContext, requireOperator } from '../session';
import { setUserSecrets } from '../service';

/**
 * Staff administration — BUILD-PLAN.md §14.1, §14.2.
 *
 * §14.1 puts user management behind `OWNER`, which `staff.write` expresses.
 * Every action here checks it server-side; the staff screen also hides the
 * controls, which §14.1 is explicit is cosmetic.
 *
 * A PIN and a password are write-only. Nothing in this file, in the queries, or
 * in the frozen `StaffMember` can return one — `hasPin: boolean` is the whole
 * of what a screen learns.
 */

export interface StaffFormState {
  readonly error: string | null;
  readonly message: string | null;
}

const CreateInput = z.object({
  displayName: z.string().trim().min(1, 'A display name is required.'),
  email: z.email('That is not an email address.'),
  roleKey: RoleKeySchema,
  password: z.string().min(12, 'A password must be at least 12 characters.'),
});

export async function createStaffAction(
  _previous: StaffFormState,
  form: FormData,
): Promise<StaffFormState> {
  const operator = await requireOperator();
  assertPermission(operator, 'staff.write');

  const parsed = CreateInput.safeParse({
    displayName: form.get('displayName'),
    email: form.get('email'),
    roleKey: form.get('roleKey'),
    password: form.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form.', message: null };
  }

  const db = dbWrite();
  const email = parsed.data.email.toLowerCase();

  const role = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.key, parsed.data.roleKey), isNull(roles.deletedAt)));
  const roleId = role[0]?.id;
  if (roleId === undefined) return { error: 'That role does not exist.', message: null };

  const clash = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)));
  if (clash[0] !== undefined) {
    return { error: 'Somebody already uses that email address.', message: null };
  }

  const passwordHash = await hashSecret(parsed.data.password);
  const context = await requestContext();

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(users)
      .values({ email, displayName: parsed.data.displayName, passwordHash })
      .returning({ id: users.id });
    const created = inserted[0];
    if (created === undefined) throw new Error('Inserting the account returned no row.');

    await tx.insert(userRoles).values({ userId: created.id, roleId });
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'users',
        entityId: created.id,
        action: 'USER_CREATED',
        after: { email, displayName: parsed.data.displayName, role: parsed.data.roleKey },
      },
    );
  });

  revalidatePath('/admin/staff');
  return { error: null, message: `${parsed.data.displayName} can now sign in.` };
}

const UpdateInput = z.object({
  userId: z.uuid(),
  displayName: z.string().trim().min(1, 'A display name is required.'),
  roleKey: RoleKeySchema,
});

/**
 * Rename somebody, or move them between roles.
 *
 * A role change is a permission change, and permissions are resolved from the
 * database on every request rather than cached in a session — so this takes
 * effect on the subject's very next action, not at the end of their shift.
 */
export async function updateStaffAction(
  _previous: StaffFormState,
  form: FormData,
): Promise<StaffFormState> {
  const operator = await requireOperator();
  assertPermission(operator, 'staff.write');

  const parsed = UpdateInput.safeParse({
    userId: form.get('userId'),
    displayName: form.get('displayName'),
    roleKey: form.get('roleKey'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form.', message: null };
  }

  const db = dbWrite();

  const role = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.key, parsed.data.roleKey), isNull(roles.deletedAt)));
  const roleId = role[0]?.id;
  if (roleId === undefined) return { error: 'That role does not exist.', message: null };

  const before = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(and(eq(users.id, parsed.data.userId), isNull(users.deletedAt)));
  if (before[0] === undefined) return { error: 'That account no longer exists.', message: null };

  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ displayName: parsed.data.displayName, updatedAt: new Date() })
      .where(eq(users.id, parsed.data.userId));

    // R6 — the old assignment is soft-deleted, never removed. Who held what,
    // and when, is a question an audit asks years later.
    await tx
      .update(userRoles)
      .set({ deletedAt: new Date() })
      .where(and(eq(userRoles.userId, parsed.data.userId), isNull(userRoles.deletedAt)));
    await tx.insert(userRoles).values({ userId: parsed.data.userId, roleId });

    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'users',
        entityId: parsed.data.userId,
        action: 'USER_UPDATED',
        before: before[0],
        after: { displayName: parsed.data.displayName, role: parsed.data.roleKey },
      },
    );
  });

  revalidatePath('/admin/staff');
  return { error: null, message: `${parsed.data.displayName} saved.` };
}

const PinInput = z.object({
  userId: z.uuid(),
  pin: z.string().regex(/^[0-9]{4,6}$/, 'Use a PIN with 4 to 6 digits.'),
});

/** §14.2 — a PIN is set or reset, never read back. */
export async function setPinAction(
  _previous: StaffFormState,
  form: FormData,
): Promise<StaffFormState> {
  const operator = await requireOperator();
  assertPermission(operator, 'staff.write');

  const parsed = PinInput.safeParse({ userId: form.get('userId'), pin: form.get('pin') });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the PIN.', message: null };
  }
  if (isGuessablePin(parsed.data.pin)) {
    return {
      error: 'That PIN is a run, a repeat, or a year. Every shared till ends up with one of those.',
      message: null,
    };
  }

  await setUserSecrets({
    actorId: operator.id,
    userId: parsed.data.userId,
    pin: parsed.data.pin,
    context: await requestContext(),
  });

  revalidatePath('/admin/staff');
  return { error: null, message: 'PIN set. It is stored hashed and cannot be shown again.' };
}

const PasswordInput = z
  .object({
    userId: z.uuid(),
    password: z.string().min(12, 'A password must be at least 12 characters.'),
    passwordConfirmation: z.string(),
  })
  .refine((value) => value.password === value.passwordConfirmation, {
    message: 'The passwords do not match.',
    path: ['passwordConfirmation'],
  });

/** A password is replaced, never read back or included in an audit record. */
export async function setPasswordAction(
  _previous: StaffFormState,
  form: FormData,
): Promise<StaffFormState> {
  const operator = await requireOperator();
  assertPermission(operator, 'staff.write');

  const parsed = PasswordInput.safeParse({
    userId: form.get('userId'),
    password: form.get('password'),
    passwordConfirmation: form.get('passwordConfirmation'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the password.', message: null };
  }

  const existing = await dbWrite()
    .select({ displayName: users.displayName })
    .from(users)
    .where(and(eq(users.id, parsed.data.userId), isNull(users.deletedAt)));
  if (existing[0] === undefined) return { error: 'That account no longer exists.', message: null };

  await setUserSecrets({
    actorId: operator.id,
    userId: parsed.data.userId,
    password: parsed.data.password,
    context: await requestContext(),
  });

  revalidatePath('/admin/staff');
  return { error: null, message: `Password updated for ${existing[0].displayName}.` };
}

const ActivationInput = z.object({ userId: z.uuid(), active: z.enum(['true', 'false']) });

export async function setActiveAction(
  _previous: StaffFormState,
  form: FormData,
): Promise<StaffFormState> {
  const operator = await requireOperator();
  assertPermission(operator, 'staff.write');

  const parsed = ActivationInput.safeParse({
    userId: form.get('userId'),
    active: form.get('active'),
  });
  if (!parsed.success) return { error: 'Check the form.', message: null };

  if (parsed.data.userId === operator.id && parsed.data.active === 'false') {
    return { error: 'Deactivating your own account would lock you out of it.', message: null };
  }

  const isActive = parsed.data.active === 'true';
  const context = await requestContext();
  const db = dbWrite();

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(users.id, parsed.data.userId));
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'users',
        entityId: parsed.data.userId,
        action: isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        after: { isActive },
      },
    );
  });

  revalidatePath('/admin/staff');
  return { error: null, message: isActive ? 'Account reactivated.' : 'Account deactivated.' };
}

const DeleteInput = z.object({
  userId: z.uuid(),
  confirmation: z.string(),
});

export async function deleteStaffAction(
  _previous: StaffFormState,
  form: FormData,
): Promise<StaffFormState> {
  const operator = await requireOperator();
  assertPermission(operator, 'staff.write');

  const parsed = DeleteInput.safeParse({
    userId: form.get('userId'),
    confirmation: form.get('confirmation'),
  });
  if (!parsed.success) return { error: 'Check the form.', message: null };
  if (parsed.data.userId === operator.id) {
    return { error: 'You cannot delete your own account.', message: null };
  }

  const db = dbWrite();
  const existing = await db
    .select({ displayName: users.displayName, email: users.email })
    .from(users)
    .where(and(eq(users.id, parsed.data.userId), isNull(users.deletedAt)));
  const member = existing[0];
  if (member === undefined) return { error: 'That account no longer exists.', message: null };
  if (parsed.data.confirmation !== member.displayName) {
    return { error: `Type ${member.displayName} exactly to confirm deletion.`, message: null };
  }

  const deletedAt = new Date();
  const context = await requestContext();
  await db.transaction(async (tx) => {
    await tx
      .update(userRoles)
      .set({ deletedAt })
      .where(and(eq(userRoles.userId, parsed.data.userId), isNull(userRoles.deletedAt)));
    await tx
      .update(users)
      .set({ isActive: false, deletedAt, updatedAt: deletedAt })
      .where(and(eq(users.id, parsed.data.userId), isNull(users.deletedAt)));
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'users',
        entityId: parsed.data.userId,
        action: 'USER_DELETED',
        before: { displayName: member.displayName, email: member.email },
        after: { deleted: true },
      },
    );
  });

  revalidatePath('/admin/staff');
  return { error: null, message: `${member.displayName} deleted.` };
}
