import 'server-only';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { authAttempts, dbRead, posTerminals, roles, settings, userRoles, users } from '@natech/db';
import { expandPermissions, primaryRole } from '@natech/auth';
import {
  RoleKeySchema,
  type Role,
  type RoleKey,
  type StaffMember,
  type Viewer,
} from '@natech/contracts';

/**
 * Reads behind the auth surfaces — BUILD-PLAN.md §14.1, §14.2.
 *
 * `dbRead` throughout (R2): every function here answers a React Server
 * Component. Anything that verifies a credential or writes an attempt lives in
 * `service.ts` and goes through `dbWrite`, because a credential check reading
 * from a route that may lag its own writes is a lockout that forgets.
 *
 * **Permissions are never cached in a token.** They are resolved from the
 * database on every request that needs them, so a role removed at 14:00 is
 * removed at 14:00 rather than whenever the session happens to expire. That is
 * one indexed query per authorised surface, which is the right side of the
 * trade for the thing that decides who may issue a fiscal document.
 */

/**
 * §5.2 gives `users` no initials column and the frozen `StaffMember` requires
 * one, so they are derived rather than stored: a second field holding the same
 * fact drifts the first time somebody is renamed.
 */
export function initialsOf(displayName: string): string {
  const letters = displayName
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return letters === '' ? '?' : letters;
}

function asRoleKeys(values: readonly string[]): RoleKey[] {
  return values.flatMap((value) => {
    const parsed = RoleKeySchema.safeParse(value);
    return parsed.success ? [parsed.data] : [];
  });
}

export interface TerminalOption {
  readonly id: string;
  readonly label: string;
}

/** §14.2 — the terminal a shift is bound to. */
export async function listActiveTerminals(): Promise<TerminalOption[]> {
  const rows = await dbRead()
    .select({ id: posTerminals.id, label: posTerminals.label })
    .from(posTerminals)
    .where(and(isNull(posTerminals.deletedAt), eq(posTerminals.isActive, true)))
    .orderBy(posTerminals.label);
  return rows;
}

interface AccountRow {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly hasPin: boolean;
  readonly roleKeys: RoleKey[];
  readonly permissions: string[];
}

async function accountsBy(where: ReturnType<typeof and>): Promise<AccountRow[]> {
  const rows = await dbRead()
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      isActive: users.isActive,
      hasPin: sql<boolean>`${users.pinHash} is not null`,
      roleKey: roles.key,
      permissions: roles.permissions,
    })
    .from(users)
    .leftJoin(userRoles, and(eq(userRoles.userId, users.id), isNull(userRoles.deletedAt)))
    .leftJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.deletedAt)))
    .where(where)
    .orderBy(users.displayName);

  const merged = new Map<string, AccountRow>();
  for (const row of rows) {
    const existing = merged.get(row.id);
    const roleKeys = existing?.roleKeys ?? [];
    const permissions = existing?.permissions ?? [];
    if (row.roleKey !== null) roleKeys.push(...asRoleKeys([row.roleKey]));
    if (row.permissions !== null) permissions.push(...row.permissions);

    merged.set(row.id, {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      isActive: row.isActive,
      hasPin: row.hasPin,
      roleKeys,
      permissions,
    });
  }
  return [...merged.values()];
}

/**
 * The signed-in identity a surface renders against — the frozen `Viewer`.
 *
 * Null for a deleted, deactivated, or role-less account, which is what makes
 * deactivating somebody take effect on their next request rather than at the
 * end of their shift.
 */
export async function loadViewer(userId: string): Promise<Viewer | null> {
  const found = await accountsBy(and(eq(users.id, userId), isNull(users.deletedAt)));
  const account = found[0];
  if (account === undefined || !account.isActive) return null;

  const role = primaryRole(account.roleKeys);
  if (role === null) return null;

  return {
    id: account.id,
    displayName: account.displayName,
    initials: initialsOf(account.displayName),
    role,
    permissions: expandPermissions(account.permissions),
  };
}

export interface TillStaffOption {
  readonly id: string;
  readonly displayName: string;
  readonly initials: string;
  readonly role: RoleKey;
}

/**
 * The faces on the lock screen — §14.2.
 *
 * The picker exists because a PIN alone cannot identify anybody: PINs are
 * stored salted, so two staff members with the same four digits are
 * indistinguishable without a name to check against, and making them
 * distinguishable would mean hashing them all the same way.
 *
 * Only accounts that can actually work a till appear: active, with a PIN set,
 * and holding a role that grants something.
 */
export async function listTillStaff(): Promise<TillStaffOption[]> {
  const accounts = await accountsBy(and(isNull(users.deletedAt), eq(users.isActive, true)));

  return accounts.flatMap((account) => {
    if (!account.hasPin) return [];
    const role = primaryRole(account.roleKeys);
    if (role === null || expandPermissions(account.permissions).length === 0) return [];
    return [
      {
        id: account.id,
        displayName: account.displayName,
        initials: initialsOf(account.displayName),
        role,
      },
    ];
  });
}

/** The admin staff screen — the frozen `StaffMember`. */
export async function listStaff(): Promise<StaffMember[]> {
  const accounts = await accountsBy(isNull(users.deletedAt));
  if (accounts.length === 0) return [];

  const lastSeen = await dbRead()
    .select({ subjectId: authAttempts.subjectId, at: sql<Date>`max(${authAttempts.at})` })
    .from(authAttempts)
    .where(
      and(
        eq(authAttempts.succeeded, true),
        inArray(
          authAttempts.subjectId,
          accounts.map((account) => account.id),
        ),
      ),
    )
    .groupBy(authAttempts.subjectId);

  const seenAt = new Map(lastSeen.map((row) => [row.subjectId, new Date(row.at)]));

  return accounts.map((account) => ({
    id: account.id,
    displayName: account.displayName,
    initials: initialsOf(account.displayName),
    email: account.email,
    // Defensive: nothing in this application creates an account without a role,
    // and one that has none cannot sign in — `loadViewer` refuses it. The frozen
    // contract has no way to say "no role", so such a row is listed under
    // `WAITER` to keep it visible and correctable rather than hidden, because an
    // invisible account is one nobody ever gets round to deactivating.
    roles: account.roleKeys.length > 0 ? account.roleKeys : (['WAITER'] as RoleKey[]),
    hasPin: account.hasPin,
    isActive: account.isActive,
    lastActiveAt: seenAt.get(account.id) ?? null,
  }));
}

/** The roles screen — §14.1, with the live membership count. */
export async function listRoles(): Promise<Role[]> {
  const rows = await dbRead()
    .select({
      key: roles.key,
      name: roles.name,
      description: roles.description,
      permissions: roles.permissions,
      memberCount: sql<number>`count(${userRoles.id})::int`,
    })
    .from(roles)
    .leftJoin(userRoles, and(eq(userRoles.roleId, roles.id), isNull(userRoles.deletedAt)))
    .where(isNull(roles.deletedAt))
    .groupBy(roles.key, roles.name, roles.description, roles.permissions);

  return rows.flatMap((row) => {
    const key = RoleKeySchema.safeParse(row.key);
    if (!key.success) return [];
    return [
      {
        key: key.data,
        name: row.name,
        description: row.description ?? 'No description recorded.',
        permissions: expandPermissions(row.permissions),
        memberCount: row.memberCount,
      },
    ];
  });
}

/** §14.2 — "Re-lock on a configurable idle timeout." This is the configuration. */
export const DEFAULT_IDLE_LOCK_SECONDS = 300;

export async function idleLockSeconds(): Promise<number> {
  const rows = await dbRead()
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, 'security.idleLockSeconds'))
    .limit(1);

  const value = rows[0]?.value;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_IDLE_LOCK_SECONDS;
  }
  return Math.floor(value);
}

/** The most recent sign-in, for the staff screen and the audit trail. */
export async function lastSignIn(userId: string): Promise<Date | null> {
  const rows = await dbRead()
    .select({ at: authAttempts.at })
    .from(authAttempts)
    .where(
      and(
        eq(authAttempts.subjectId, userId),
        eq(authAttempts.kind, 'PASSWORD'),
        eq(authAttempts.succeeded, true),
      ),
    )
    .orderBy(desc(authAttempts.at))
    .limit(1);
  return rows[0]?.at ?? null;
}
