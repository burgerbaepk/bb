import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import {
  authAttemptHistory,
  dbWrite,
  recordAuthAttempt,
  roles,
  userRoles,
  users,
  writeAudit,
  type AuthAttemptKind,
  type Tx,
} from '@natech/db';
import {
  PASSWORD_LOCKOUT,
  PIN_LOCKOUT,
  hashSecret,
  lockState,
  primaryRole,
  verifySecret,
  type LockoutPolicy,
} from '@natech/auth';
import { RoleKeySchema, type RoleKey } from '@natech/contracts';

/**
 * Credential verification — BUILD-PLAN.md §14.2.
 *
 * Everything here goes through `dbWrite` (R2). These are not RSC reads: an
 * attempt is written on every path including the failures, and a lockout that
 * counted from a route which may lag its own writes is a lockout that forgets
 * the last four attempts under exactly the load an attacker creates.
 *
 * Every function returns a discriminated result rather than throwing. The
 * caller needs to tell "wrong PIN" from "locked out for another 40 seconds" to
 * say anything useful on screen, and an exception type per outcome is a worse
 * way to express six outcomes than a union is.
 */

type Db = ReturnType<typeof dbWrite>;
type AttemptKind = AuthAttemptKind;

export interface RequestContext {
  readonly ip: string | null;
  readonly ua: string | null;
}

/**
 * A hash of nothing, verified against when no account matched.
 *
 * Without it, an unknown email returns in a millisecond and a known one takes
 * as long as scrypt does, which is a list of who works here readable from a
 * stopwatch.
 */
const DECOY_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

async function burnTime(supplied: string): Promise<void> {
  await verifySecret(supplied, DECOY_HASH);
}

async function recordAttempt(
  db: Db | Tx,
  entry: {
    readonly kind: AttemptKind;
    readonly subjectId: string | null;
    readonly subjectLabel: string | null;
    readonly terminalId: string | null;
    readonly succeeded: boolean;
    readonly context: RequestContext;
  },
): Promise<void> {
  await recordAuthAttempt(db, {
    kind: entry.kind,
    subjectId: entry.subjectId,
    subjectLabel: entry.subjectLabel,
    terminalId: entry.terminalId,
    succeeded: entry.succeeded,
    ip: entry.context.ip,
    ua: entry.context.ua,
  });
}

async function guard(
  db: Db,
  subjectId: string,
  kind: AttemptKind,
  policy: LockoutPolicy,
): Promise<{ locked: true; retryAfterSeconds: number } | { locked: false; remaining: number }> {
  const state = lockState(await authAttemptHistory(db, subjectId, kind), policy);
  return state.locked
    ? { locked: true, retryAfterSeconds: state.retryAfterSeconds }
    : { locked: false, remaining: state.remaining };
}

interface Account {
  readonly id: string;
  readonly displayName: string;
  readonly isActive: boolean;
  readonly passwordHash: string | null;
  readonly pinHash: string | null;
  readonly roleKeys: RoleKey[];
}

async function accountBy(db: Db, column: 'email' | 'id', value: string): Promise<Account | null> {
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      isActive: users.isActive,
      passwordHash: users.passwordHash,
      pinHash: users.pinHash,
      roleKey: roles.key,
    })
    .from(users)
    .leftJoin(userRoles, and(eq(userRoles.userId, users.id), isNull(userRoles.deletedAt)))
    .leftJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.deletedAt)))
    .where(
      and(
        column === 'email' ? eq(users.email, value.toLowerCase()) : eq(users.id, value),
        isNull(users.deletedAt),
      ),
    );

  const first = rows[0];
  if (first === undefined) return null;

  const roleKeys = rows.flatMap((row) => {
    if (row.roleKey === null) return [];
    const parsed = RoleKeySchema.safeParse(row.roleKey);
    return parsed.success ? [parsed.data] : [];
  });

  return { ...first, roleKeys };
}

/* --------------------------------------------------- §14.2 terminal binding */

export type SignInResult =
  | { readonly ok: true; readonly userId: string }
  | { readonly ok: false; readonly reason: 'INVALID' }
  | { readonly ok: false; readonly reason: 'INACTIVE' }
  | { readonly ok: false; readonly reason: 'NO_ROLE' }
  | { readonly ok: false; readonly reason: 'LOCKED'; readonly retryAfterSeconds: number };

/** "Bind a terminal for the shift with email and password" (§14.2). */
export async function verifySignIn(input: {
  readonly email: string;
  readonly password: string;
  readonly terminalId: string;
  readonly context: RequestContext;
}): Promise<SignInResult> {
  const db = dbWrite();
  const account = await accountBy(db, 'email', input.email);

  if (account === null) {
    await burnTime(input.password);
    await recordAttempt(db, {
      kind: 'PASSWORD',
      subjectId: null,
      subjectLabel: input.email.toLowerCase(),
      terminalId: input.terminalId,
      succeeded: false,
      context: input.context,
    });
    return { ok: false, reason: 'INVALID' };
  }

  const lock = await guard(db, account.id, 'PASSWORD', PASSWORD_LOCKOUT);
  if (lock.locked) {
    return { ok: false, reason: 'LOCKED', retryAfterSeconds: lock.retryAfterSeconds };
  }

  const passwordOk = await verifySecret(input.password, account.passwordHash);
  if (!passwordOk) {
    await recordAttempt(db, {
      kind: 'PASSWORD',
      subjectId: account.id,
      subjectLabel: null,
      terminalId: input.terminalId,
      succeeded: false,
      context: input.context,
    });
    return { ok: false, reason: 'INVALID' };
  }

  if (!account.isActive) return { ok: false, reason: 'INACTIVE' };
  if (primaryRole(account.roleKeys) === null) return { ok: false, reason: 'NO_ROLE' };

  await db.transaction(async (tx) => {
    await recordAttempt(tx, {
      kind: 'PASSWORD',
      subjectId: account.id,
      subjectLabel: null,
      terminalId: input.terminalId,
      succeeded: true,
      context: input.context,
    });
    // R7 — binding a till to a person for a shift is the fact every later audit
    // row hangs off, so it is recorded as its own mutation.
    await writeAudit(
      tx,
      { actorId: account.id, ip: input.context.ip ?? undefined, ua: input.context.ua ?? undefined },
      {
        entity: 'pos_terminals',
        entityId: input.terminalId,
        action: 'TERMINAL_BOUND',
        after: { userId: account.id, displayName: account.displayName },
      },
    );
  });

  return { ok: true, userId: account.id };
}

/* ------------------------------------------------------------ §14.2 the PIN */

export type PinResult =
  | { readonly ok: true; readonly userId: string }
  | { readonly ok: false; readonly reason: 'INVALID'; readonly remaining: number }
  | { readonly ok: false; readonly reason: 'LOCKED'; readonly retryAfterSeconds: number };

/** "Identify individual staff with a 4 to 6 digit PIN per till action" (§14.2). */
export async function verifyPin(input: {
  readonly userId: string;
  readonly pin: string;
  readonly terminalId: string;
  readonly context: RequestContext;
}): Promise<PinResult> {
  const db = dbWrite();

  const lock = await guard(db, input.userId, 'PIN', PIN_LOCKOUT);
  if (lock.locked) {
    return { ok: false, reason: 'LOCKED', retryAfterSeconds: lock.retryAfterSeconds };
  }

  const account = await accountBy(db, 'id', input.userId);
  const ok =
    account !== null &&
    account.isActive &&
    primaryRole(account.roleKeys) !== null &&
    (await verifySecret(input.pin, account.pinHash));

  if (!ok) await burnTime(input.pin);

  await recordAttempt(db, {
    kind: 'PIN',
    subjectId: account === null ? null : account.id,
    subjectLabel: account === null ? input.userId : null,
    terminalId: input.terminalId,
    succeeded: ok,
    context: input.context,
  });

  if (!ok) return { ok: false, reason: 'INVALID', remaining: Math.max(0, lock.remaining - 1) };
  return { ok: true, userId: input.userId };
}

/** Used by the staff screen after its permission check. */
export async function setUserSecrets(input: {
  readonly actorId: string;
  readonly userId: string;
  readonly password?: string;
  readonly pin?: string | null;
  readonly context: RequestContext;
}): Promise<void> {
  const db = dbWrite();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.password !== undefined) patch['passwordHash'] = await hashSecret(input.password);
  if (input.pin !== undefined) {
    patch['pinHash'] = input.pin === null ? null : await hashSecret(input.pin);
  }

  await db.transaction(async (tx) => {
    await tx.update(users).set(patch).where(eq(users.id, input.userId));
    await writeAudit(
      tx,
      {
        actorId: input.actorId,
        ip: input.context.ip ?? undefined,
        ua: input.context.ua ?? undefined,
      },
      {
        entity: 'users',
        entityId: input.userId,
        action: 'CREDENTIALS_SET',
        // Never the value, and never a hash — an audit trail is read by people
        // who are not supposed to be able to sign in as the subject of it.
        after: {
          password: input.password !== undefined,
          pin: input.pin === undefined ? 'unchanged' : input.pin === null ? 'cleared' : 'set',
        },
      },
    );
  });
}
