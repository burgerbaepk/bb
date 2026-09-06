import { describe, expect, it } from 'vitest';
import { can, PermissionSchema, type Viewer } from '@natech/contracts';
import {
  ALL_PERMISSIONS,
  expandPermissions,
  isPermission,
  primaryRole,
  unknownGrants,
} from '../src/permissions';
import { PASSWORD_LOCKOUT, PIN_LOCKOUT, lockState } from '../src/lockout';
import { signToken, verifyToken } from '../src/tokens';

describe('permission resolution — §14.1', () => {
  it('expands the OWNER wildcard to every permission in the frozen contract', () => {
    expect(expandPermissions(['*'])).toEqual([...ALL_PERMISSIONS]);
  });

  it('keeps the frozen can() a plain membership test', () => {
    const viewer: Viewer = {
      id: '00000000-0000-4000-8000-000000000001',
      displayName: 'Owner',
      initials: 'OW',
      role: 'OWNER',
      permissions: expandPermissions(['*']),
    };
    expect(can(viewer, 'settings.write')).toBe(true);
  });

  it('drops a grant that is not a permission', () => {
    expect(expandPermissions(['order.void', 'not.a.permission'])).toEqual(['order.void']);
    expect(unknownGrants(['order.void', 'not.a.permission'])).toEqual(['not.a.permission']);
  });

  it('deduplicates across roles and returns contract order', () => {
    expect(expandPermissions(['payment.take', 'order.void', 'order.void'])).toEqual([
      'order.void',
      'payment.take',
    ]);
  });

  it('grants nothing to an empty role', () => {
    expect(expandPermissions([])).toEqual([]);
  });

  it('agrees with the contract about what a permission is', () => {
    for (const permission of PermissionSchema.options) {
      expect(isPermission(permission)).toBe(true);
    }
    expect(isPermission('*')).toBe(false);
  });
});

describe('primary role — §14.1', () => {
  it('names the most privileged role a user holds', () => {
    expect(primaryRole(['WAITER', 'MANAGER'])).toBe('MANAGER');
    expect(primaryRole([])).toBeNull();
  });
});

describe('lockout policy — §14.2', () => {
  const now = new Date('2026-08-24T10:00:00.000Z');
  const secondsAgo = (n: number) => new Date(now.getTime() - n * 1000);

  it('does not lock below the threshold', () => {
    const state = lockState(
      { consecutiveFailures: 4, lastFailureAt: secondsAgo(1) },
      PIN_LOCKOUT,
      now,
    );
    expect(state.locked).toBe(false);
    expect(state.remaining).toBe(1);
  });

  it('locks at the threshold and reports how long is left', () => {
    const state = lockState(
      { consecutiveFailures: 5, lastFailureAt: secondsAgo(10) },
      PIN_LOCKOUT,
      now,
    );
    expect(state.locked).toBe(true);
    expect(state.retryAfterSeconds).toBe(50);
    expect(state.remaining).toBe(0);
  });

  it('allows exactly one attempt once the lock elapses', () => {
    const state = lockState(
      { consecutiveFailures: 9, lastFailureAt: secondsAgo(61) },
      PIN_LOCKOUT,
      now,
    );
    expect(state.locked).toBe(false);
    expect(state.remaining).toBe(1);
  });

  it('re-arms immediately when that attempt also fails', () => {
    const state = lockState({ consecutiveFailures: 10, lastFailureAt: now }, PIN_LOCKOUT, now);
    expect(state.locked).toBe(true);
    expect(state.retryAfterSeconds).toBe(60);
  });

  it('holds a password lock for fifteen minutes', () => {
    const state = lockState({ consecutiveFailures: 5, lastFailureAt: now }, PASSWORD_LOCKOUT, now);
    expect(state.retryAfterSeconds).toBe(900);
  });

  it('cannot lock without a recorded failure', () => {
    expect(
      lockState({ consecutiveFailures: 99, lastFailureAt: null }, PIN_LOCKOUT, now).locked,
    ).toBe(false);
  });
});

describe('signed short-lived tokens — §14.2', () => {
  const now = 1_756_000_000_000;

  it('round-trips its payload', () => {
    const token = signToken('staff-unlock', { sub: 'abc' }, 60, now);
    expect(verifyToken('staff-unlock', token, now)?.data).toEqual({ sub: 'abc' });
  });

  it('refuses a token presented for a different purpose', () => {
    const token = signToken('staff-unlock', { sub: 'abc' }, 60, now);
    expect(verifyToken('customer-session', token, now)).toBeNull();
  });

  it('refuses a token past its expiry', () => {
    const token = signToken('customer-session', { sub: 'abc' }, 60, now);
    expect(verifyToken('customer-session', token, now + 59_000)).not.toBeNull();
    expect(verifyToken('customer-session', token, now + 60_000)).toBeNull();
  });

  it('refuses a tampered payload', () => {
    const token = signToken('staff-unlock', { sub: 'abc' }, 60, now);
    const signature = token.slice(token.lastIndexOf('.') + 1);
    const forged = Buffer.from(
      JSON.stringify({ p: 'staff-unlock', iat: 1, exp: 9e9, d: { sub: 'x' } }),
    ).toString('base64url');
    expect(verifyToken('staff-unlock', `${forged}.${signature}`, now)).toBeNull();
  });

  it('refuses nonsense without throwing', () => {
    expect(verifyToken('staff-unlock', undefined, now)).toBeNull();
    expect(verifyToken('staff-unlock', '', now)).toBeNull();
    expect(verifyToken('staff-unlock', 'no-separator', now)).toBeNull();
    expect(verifyToken('staff-unlock', '.abc', now)).toBeNull();
  });
});
