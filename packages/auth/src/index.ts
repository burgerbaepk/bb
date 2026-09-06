/**
 * @natech/auth — credential handling for BUILD-PLAN.md §14.1 (§14.2's TOTP
 * clause removed — ADR 0015).
 *
 * Node only, and framework-free on purpose. Three callers need the same
 * primitives and none of them is a React tree: `apps/pos` verifying a login,
 * `packages/db/seeds` creating the first owner account, and the `pnpm
 * brand:init` provisioning script in §14.6. A hashing function that lives
 * inside an app cannot be called by the seed that has to populate it.
 *
 * What is here: hashing (`hash.ts`), the §14.1 permission resolution
 * (`permissions.ts`), signed short-lived application tokens
 * layers (`tokens.ts`), and the lockout policy (`lockout.ts`).
 *
 * What is not: any database access, any cookie, any redirect. Those are
 * request-shaped and live in `apps/pos/lib/auth`.
 */

export { derivedKey, resetDerivedKeys, type KeyPurpose } from './env';
export { hashSecret, isGuessablePin, isWellFormedPin, verifySecret } from './hash';
export {
  ALL_PERMISSIONS,
  WILDCARD,
  expandPermissions,
  isPermission,
  primaryRole,
  unknownGrants,
} from './permissions';
export { signToken, verifyToken, type TokenPurpose, type VerifiedToken } from './tokens';
export {
  PASSWORD_LOCKOUT,
  PIN_LOCKOUT,
  lockState,
  type AttemptHistory,
  type LockState,
  type LockoutPolicy,
} from './lockout';
