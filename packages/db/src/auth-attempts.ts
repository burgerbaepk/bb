import { sql } from 'drizzle-orm';
import { authAttempts } from './schema';
import type { Tx } from './tx';
import type { dbWrite } from './client';

/**
 * Attempt accounting — BUILD-PLAN.md §14.2.
 *
 * The lockout *policy* is pure and lives in `@natech/auth`. This is the durable
 * count it reads, and it is here rather than in the app for one reason: the
 * "failures since the last success" query is the part of the §14.2 PIN layer
 * most likely to be quietly wrong, and this package is the one with an
 * integration suite pointed at a real Postgres.
 *
 * Both functions take a client or a transaction. Recording an attempt inside
 * the same transaction as the mutation it authorised is the difference between
 * a lockout that counts and one that forgets under load.
 */

export type AuthAttemptKind = 'PASSWORD' | 'PIN' | 'TOTP';

export interface AuthAttemptEntry {
  readonly kind: AuthAttemptKind;
  /** The account the attempt was against. Null when the email matched nobody. */
  readonly subjectId: string | null;
  /** What was typed, for the rows where no account was found. Never a credential. */
  readonly subjectLabel: string | null;
  readonly terminalId: string | null;
  readonly succeeded: boolean;
  readonly ip: string | null;
  readonly ua: string | null;
}

export async function recordAuthAttempt(
  db: ReturnType<typeof dbWrite> | Tx,
  entry: AuthAttemptEntry,
): Promise<void> {
  await db.insert(authAttempts).values({
    kind: entry.kind,
    subjectId: entry.subjectId,
    subjectLabel: entry.subjectLabel,
    terminalId: entry.terminalId,
    succeeded: entry.succeeded,
    ip: entry.ip,
    ua: entry.ua,
  });
}

export interface AuthAttemptHistory {
  readonly consecutiveFailures: number;
  readonly lastFailureAt: Date | null;
}

/**
 * Failures since the last success, and when the most recent one was.
 *
 * Consecutive, not windowed. A window forgives an attacker who paces
 * themselves, and punishes a cashier who mistyped once an hour ago. A
 * successful attempt is the reset, which is why successes are stored too.
 */
export async function authAttemptHistory(
  db: ReturnType<typeof dbWrite> | Tx,
  subjectId: string,
  kind: AuthAttemptKind,
): Promise<AuthAttemptHistory> {
  const result = await db.execute<{ failures: number; last_failure: string | Date | null }>(sql`
    with last_success as (
      select coalesce(max(at), timestamptz 'epoch') as at
      from auth_attempts
      where subject_id = ${subjectId}
        and kind = ${kind}
        and succeeded
    )
    select count(*)::int as failures, max(a.at) as last_failure
    from auth_attempts a, last_success
    where a.subject_id = ${subjectId}
      and a.kind = ${kind}
      and not a.succeeded
      and a.at > last_success.at
  `);

  const row = result.rows[0];
  const last = row?.last_failure ?? null;

  return {
    consecutiveFailures: row?.failures ?? 0,
    // `execute` returns raw driver values, and an aggregate over a timestamptz
    // arrives as a string rather than as the Date a mapped select would give.
    // The lockout policy calls `.getTime()` on this, so the coercion is the
    // difference between a lock and a TypeError at the moment somebody is
    // guessing PINs.
    lastFailureAt: last === null ? null : last instanceof Date ? last : new Date(last),
  };
}
