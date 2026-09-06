import { PermissionSchema, type Permission, type RoleKey } from '@natech/contracts';

/**
 * Permission resolution — BUILD-PLAN.md §14.1.
 *
 * §14.1: "Check server-side on every action. Client-side hiding is cosmetic."
 * This is the server side of that sentence, and it is deliberately the only
 * place a permission string is interpreted.
 *
 * `roles.permissions` is `text[]`, so the database can hold a string that is
 * not a permission — a typo in a seed, a key from a version of the plan that
 * no longer exists. Resolution drops anything outside the frozen
 * `PermissionSchema` rather than passing it through, because a permission
 * nothing checks is at best noise on the roles screen and at worst a grant
 * somebody believes they made.
 *
 * `OWNER` is seeded `['*']` per §14.1 ("Everything"). The wildcard is expanded
 * here, so the frozen `can()` in the contracts stays a plain membership test
 * and no caller has to remember that one role is special.
 */

export const WILDCARD = '*';

/** Every permission in the frozen contract, in declaration order. */
export const ALL_PERMISSIONS: readonly Permission[] = Object.freeze([...PermissionSchema.options]);

const KNOWN = new Set<string>(ALL_PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return KNOWN.has(value);
}

/**
 * Flatten the grants of every role a user holds into one deduplicated list, in
 * contract order so two users with the same access compare equal.
 */
export function expandPermissions(granted: readonly string[]): Permission[] {
  if (granted.includes(WILDCARD)) return [...ALL_PERMISSIONS];

  const held = new Set(granted.filter(isPermission));
  return ALL_PERMISSIONS.filter((permission) => held.has(permission));
}

/** Anything in the grant list that is not a permission. The staff screen shows it. */
export function unknownGrants(granted: readonly string[]): string[] {
  return granted.filter((value) => value !== WILDCARD && !isPermission(value));
}

/**
 * The role a surface names when it has room for one — the most privileged the
 * user holds. §14.1 lists the roles in descending order of capability and this
 * follows it.
 */
const ROLE_RANK: readonly RoleKey[] = ['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'AUDITOR'];

export function primaryRole(roleKeys: readonly RoleKey[]): RoleKey | null {
  for (const key of ROLE_RANK) {
    if (roleKeys.includes(key)) return key;
  }
  return null;
}
