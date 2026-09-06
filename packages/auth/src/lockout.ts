/**
 * Attempt lockout — BUILD-PLAN.md §14.2.
 *
 * §14.2 specifies a 4-to-6 digit PIN on a terminal that sits on a counter in a
 * restaurant. Ten thousand candidates is a minute of typing, so the PIN is only
 * a credential if a wrong one costs something. This module is the policy; the
 * `auth_attempts` table is the record it reads.
 *
 * Pure and clock-injected, so every boundary is a unit test rather than a
 * `setTimeout` in an integration suite.
 *
 * The count is of **consecutive** failures — failures since the last success —
 * not failures in a window. A window forgives an attacker who paces themselves,
 * and it punishes a cashier who mistyped once an hour ago.
 */

export interface LockoutPolicy {
  /** Failures tolerated before the next attempt is refused. */
  readonly threshold: number;
  /** How long a refusal lasts, measured from the last failure. */
  readonly lockSeconds: number;
}

/**
 * A PIN is typed at speed on a touchscreen by someone holding three plates, so
 * the threshold is generous and the lock is short. A password is typed once a
 * shift, so a longer lock costs almost nothing.
 */
export const PIN_LOCKOUT: LockoutPolicy = { threshold: 5, lockSeconds: 60 };
export const PASSWORD_LOCKOUT: LockoutPolicy = { threshold: 5, lockSeconds: 900 };

export interface AttemptHistory {
  readonly consecutiveFailures: number;
  readonly lastFailureAt: Date | null;
}

export interface LockState {
  readonly locked: boolean;
  /** When the next attempt is permitted. Null when not locked. */
  readonly until: Date | null;
  readonly retryAfterSeconds: number;
  /** Attempts left before a lock. Zero while locked. */
  readonly remaining: number;
}

export function lockState(
  history: AttemptHistory,
  policy: LockoutPolicy,
  now: Date = new Date(),
): LockState {
  const failures = Math.max(0, history.consecutiveFailures);
  const remaining = Math.max(0, policy.threshold - failures);

  if (failures < policy.threshold || history.lastFailureAt === null) {
    return { locked: false, until: null, retryAfterSeconds: 0, remaining };
  }

  const until = new Date(history.lastFailureAt.getTime() + policy.lockSeconds * 1000);
  if (until.getTime() <= now.getTime()) {
    // The lock has elapsed. One attempt is allowed; if it fails, `lastFailureAt`
    // moves and the lock re-arms immediately, because the failure count is
    // still at or above the threshold.
    return { locked: false, until: null, retryAfterSeconds: 0, remaining: 1 };
  }

  return {
    locked: true,
    until,
    retryAfterSeconds: Math.ceil((until.getTime() - now.getTime()) / 1000),
    remaining: 0,
  };
}
