import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { PIN_LOCKOUT, lockState } from '@natech/auth';
import { closeDb, dbWrite } from '../src/client';
import { authAttemptHistory, recordAuthAttempt } from '../src/auth-attempts';
import { authAttempts, roles, userRoles, users } from '../src/schema';

/**
 * §14.2 attempt accounting, against a real Postgres.
 *
 * The lockout policy is pure and proved in `packages/auth`. What cannot be
 * proved there is the query underneath it — "failures since the last success"
 * is a correlated aggregate over a table that is written on every login, and
 * getting it subtly wrong produces a PIN layer that looks like it works and
 * lets an attacker try all ten thousand.
 *
 * Skips without a database rather than failing, so CI stays green without
 * secrets — the same rule `constraints.test.ts` follows.
 */
const live = ['NEON_DATABASE_URL', 'NEON_DATABASE_URL_HTTP'].every((name) => {
  const value = process.env[name];
  return typeof value === 'string' && value.trim().length > 0;
});
const describeLive = live ? describe : describe.skip;

describeLive('auth_attempts — §14.2', () => {
  let db!: ReturnType<typeof dbWrite>;
  let subjectId = '';

  beforeAll(async () => {
    db = dbWrite();
    const role = await db
      .select({ id: roles.id })
      .from(roles)
      .where(sql`${roles.key} = 'CASHIER' and ${roles.deletedAt} is null`);
    const roleId = role[0]?.id;
    if (roleId === undefined) throw new Error('Seed the roles first: pnpm db:seed');

    const inserted = await db
      .insert(users)
      .values({
        email: `attempts-${Date.now()}@test.invalid`,
        displayName: 'Attempt Subject',
      })
      .returning({ id: users.id });
    const created = inserted[0];
    if (created === undefined) throw new Error('inserting the test account returned no row');
    subjectId = created.id;
    await db.insert(userRoles).values({ userId: subjectId, roleId });
  });

  afterAll(async () => {
    if (subjectId !== '') {
      await db.delete(authAttempts).where(eq(authAttempts.subjectId, subjectId));
      await db.delete(userRoles).where(eq(userRoles.userId, subjectId));
      await db.delete(users).where(eq(users.id, subjectId));
    }
    await closeDb();
  });

  const fail = () =>
    recordAuthAttempt(db, {
      kind: 'PIN',
      subjectId,
      subjectLabel: null,
      terminalId: null,
      succeeded: false,
      ip: '127.0.0.1',
      ua: 'vitest',
    });

  const succeed = () =>
    recordAuthAttempt(db, {
      kind: 'PIN',
      subjectId,
      subjectLabel: null,
      terminalId: null,
      succeeded: true,
      ip: '127.0.0.1',
      ua: 'vitest',
    });

  it('counts nothing for an account that has never tried', async () => {
    const history = await authAttemptHistory(db, subjectId, 'PIN');
    expect(history.consecutiveFailures).toBe(0);
    expect(history.lastFailureAt).toBeNull();
  });

  it('counts consecutive failures and dates the last one', async () => {
    await fail();
    await fail();

    const history = await authAttemptHistory(db, subjectId, 'PIN');
    expect(history.consecutiveFailures).toBe(2);
    expect(history.lastFailureAt).toBeInstanceOf(Date);
  });

  it('a success resets the count — this is what makes it a lockout and not a ban', async () => {
    await succeed();

    const history = await authAttemptHistory(db, subjectId, 'PIN');
    expect(history.consecutiveFailures).toBe(0);
    expect(history.lastFailureAt).toBeNull();
  });

  it('counts again from the reset, not from the beginning of time', async () => {
    await fail();
    expect((await authAttemptHistory(db, subjectId, 'PIN')).consecutiveFailures).toBe(1);
  });

  it('keeps the kinds apart — a wrong password does not lock the PIN', async () => {
    await recordAuthAttempt(db, {
      kind: 'PASSWORD',
      subjectId,
      subjectLabel: null,
      terminalId: null,
      succeeded: false,
      ip: null,
      ua: null,
    });

    expect((await authAttemptHistory(db, subjectId, 'PIN')).consecutiveFailures).toBe(1);
    expect((await authAttemptHistory(db, subjectId, 'PASSWORD')).consecutiveFailures).toBe(1);
  });

  it('locks the PIN at the §14.2 threshold and reports a wait', async () => {
    // One failure is already recorded above; four more reach the threshold.
    await fail();
    await fail();
    await fail();
    await fail();

    const history = await authAttemptHistory(db, subjectId, 'PIN');
    expect(history.consecutiveFailures).toBe(5);

    // The database and test runner clocks can differ slightly. The pure policy
    // has its wall-clock boundaries covered in @natech/auth; here we only need
    // to prove that the persisted last-failure timestamp arms the lock.
    const state = lockState(history, PIN_LOCKOUT, history.lastFailureAt!);
    expect(state.locked).toBe(true);
    expect(state.retryAfterSeconds).toBe(PIN_LOCKOUT.lockSeconds);
  });

  it('records the IP and user agent an audit would ask for (R7)', async () => {
    const rows = await db
      .select({ ip: authAttempts.ip, ua: authAttempts.ua })
      .from(authAttempts)
      .where(sql`${authAttempts.subjectId} = ${subjectId} and ${authAttempts.kind} = 'PIN'`)
      .limit(1);
    expect(rows[0]?.ip).toBe('127.0.0.1');
    expect(rows[0]?.ua).toBe('vitest');
  });

  it('records an attempt against an email that matched nobody, without a subject', async () => {
    const label = `ghost-${Date.now()}@test.invalid`;
    await recordAuthAttempt(db, {
      kind: 'PASSWORD',
      subjectId: null,
      subjectLabel: label,
      terminalId: null,
      succeeded: false,
      ip: null,
      ua: null,
    });

    const rows = await db
      .select({ subjectId: authAttempts.subjectId, subjectLabel: authAttempts.subjectLabel })
      .from(authAttempts)
      .where(eq(authAttempts.subjectLabel, label));

    expect(rows[0]?.subjectId).toBeNull();
    expect(rows[0]?.subjectLabel).toBe(label);

    await db.delete(authAttempts).where(eq(authAttempts.subjectLabel, label));
  });
});
