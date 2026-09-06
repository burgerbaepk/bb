import { hkdfSync } from 'node:crypto';

/**
 * Key material — BUILD-PLAN.md §4.
 *
 * Every application token purpose derives from `ENCRYPTION_KEY` through HKDF-SHA256, so a token
 * signed for a PIN unlock cannot be replayed as a customer session: the two are signed
 * under different derived keys rather than under one secret with a field
 * inside saying which it is. An AES-256 key is 32 bytes, and an operator
 * setting an environment variable produces a string — base64, hex, or a
 * passphrase, depending on which command they happened to run — so deriving
 * fixes the length at 32 bytes regardless of what was set.
 *
 * `AUTH_SECRET` remains dedicated to Auth.js session signing. Keeping the two
 * roots separate means rotating application-token encryption does not invalidate
 * every signed-in terminal, and rotating sessions does not affect OTP data.
 *
 * Derivation is not a substitute for entropy. A short `ENCRYPTION_KEY` is a short
 * secret however it is stretched, so it is refused below 32 characters.
 */

/** Fixed, non-secret. HKDF salts need to be stable, not hidden. */
const SALT = Buffer.from('natech-pos/hkdf/v1');

const MIN_LENGTH = 32;

export type KeyPurpose =
  | 'staff-unlock'
  | 'sign-in-handoff'
  /** §13.3 — the storefront's own 90-day session cookie (M14). A customer's
   * identity must not be presentable as any staff purpose, or the reverse. */
  | 'customer-session';

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is not set. See BUILD-PLAN.md §4.`);
  }
  if (value.length < MIN_LENGTH) {
    throw new Error(`${name} is shorter than ${MIN_LENGTH} characters. Generate a new one.`);
  }
  return value;
}

const cache = new Map<KeyPurpose, Buffer>();

/**
 * A 32-byte key for one purpose, derived from the environment secret that
 * governs it. Cached: HKDF is cheap but this runs on every request.
 */
export function derivedKey(purpose: KeyPurpose): Buffer {
  const hit = cache.get(purpose);
  if (hit !== undefined) return hit;

  const key = Buffer.from(
    hkdfSync('sha256', required('ENCRYPTION_KEY'), SALT, `restaurant-os/${purpose}`, 32),
  );
  cache.set(purpose, key);
  return key;
}

/** Tests and long-running scripts that change the environment mid-flight. */
export function resetDerivedKeys(): void {
  cache.clear();
}
