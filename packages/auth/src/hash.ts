import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Password and PIN storage — BUILD-PLAN.md §5.2, §14.2.
 *
 * `scrypt` from `node:crypto`, not bcrypt or argon2. Both of those are native
 * modules, and this code has to run in three places that disagree about native
 * modules: a Vercel serverless function, a seed script on a laptop, and CI.
 * A memory-hard KDF that ships with the runtime has no build step to get wrong.
 *
 * **The KDF is not what protects a PIN.** §14.2 specifies 4 to 6 digits, so the
 * search space is at worst ten thousand. No cost parameter makes that safe; a
 * lockout does, and `lockout.ts` is where that lives. The cost here is set for
 * the password and reused for the PIN, because a PIN is verified on every till
 * action and a cashier waiting 300ms to add an item would learn to leave the
 * till unlocked, which is the outcome the PIN exists to prevent.
 *
 * Parameters are stored in the encoded string rather than assumed, so raising
 * the cost later does not invalidate every existing credential.
 */

/** ~16MB and roughly 40ms on the hardware this deploys to. */
const COST = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

/** node's default maxmem is 32MB, which N=16384 sits just under. Headroom. */
const MAX_MEM = 64 * 1024 * 1024;

const PREFIX = 'scrypt';

interface ScryptCost {
  readonly N: number;
  readonly r: number;
  readonly p: number;
}

function derive(secret: string, salt: Buffer, cost: ScryptCost): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      secret.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { ...cost, maxmem: MAX_MEM },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

/** `scrypt$N$r$p$salt$hash`, all base64url. */
export async function hashSecret(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(plain, salt, COST);
  return [
    PREFIX,
    COST.N,
    COST.r,
    COST.p,
    salt.toString('base64url'),
    key.toString('base64url'),
  ].join('$');
}

/**
 * Constant-time verification. Returns false rather than throwing on a
 * malformed stored value: a corrupt row must not be distinguishable from a
 * wrong password by the shape of the failure.
 */
export async function verifySecret(plain: string, stored: string | null): Promise<boolean> {
  if (stored === null || stored === '') return false;

  const parts = stored.split('$');
  if (parts.length !== 6) return false;
  const [prefix, rawN, rawR, rawP, rawSalt, rawKey] = parts;
  if (prefix !== PREFIX) return false;
  if (rawN === undefined || rawR === undefined || rawP === undefined) return false;
  if (rawSalt === undefined || rawKey === undefined) return false;

  const N = Number.parseInt(rawN, 10);
  const r = Number.parseInt(rawR, 10);
  const p = Number.parseInt(rawP, 10);
  if (!Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p))
    return false;

  const salt = Buffer.from(rawSalt, 'base64url');
  const expected = Buffer.from(rawKey, 'base64url');
  if (salt.length === 0 || expected.length !== KEY_LENGTH) return false;

  let actual: Buffer;
  try {
    actual = await derive(plain, salt, { N, r, p });
  } catch {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

/** §14.2 — 4 to 6 digits, and nothing else. */
export function isWellFormedPin(pin: string): boolean {
  return /^[0-9]{4,6}$/.test(pin);
}

/**
 * A PIN that is a run, a repeat, or the year is the PIN every shared till ends
 * up with. Refusing them at the point of setting is cheaper than a lockout
 * policy that has to assume the PIN is 1234.
 */
export function isGuessablePin(pin: string): boolean {
  if (/^(\d)\1*$/.test(pin)) return true;

  const digits = [...pin].map(Number);
  const ascending = digits.every((d, i) => i === 0 || d === (digits[i - 1] ?? -9) + 1);
  const descending = digits.every((d, i) => i === 0 || d === (digits[i - 1] ?? -9) - 1);
  if (ascending || descending) return true;

  return /^(19|20)\d{2}$/.test(pin);
}
