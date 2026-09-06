import { createHmac, timingSafeEqual } from 'node:crypto';
import { derivedKey, type KeyPurpose } from './env';

/**
 * Short-lived signed tokens — BUILD-PLAN.md §14.2.
 *
 * Two facts in §14.2 outlive a single request but must not outlive the shift
 * session they sit inside: which staff member is currently identified at the
 * till and short-lived application handoffs.
 *
 * Each is a payload signed with a key derived for that purpose alone
 * (`env.ts`), so a token minted for one cannot be presented as another even
 * though all three ride in cookies on the same host. The expiry is inside the
 * signed payload, not on the cookie: a cookie lifetime is a request from the
 * server to the browser, and the browser is the thing being defended against.
 */

export type TokenPurpose = Extract<
  KeyPurpose,
  'staff-unlock' | 'sign-in-handoff' | 'customer-session'
>;

interface Envelope {
  readonly p: TokenPurpose;
  /** Issued at, epoch seconds. */
  readonly iat: number;
  /** Expires at, epoch seconds. */
  readonly exp: number;
  readonly d: unknown;
}

function sign(purpose: TokenPurpose, body: string): string {
  return createHmac('sha256', derivedKey(purpose)).update(body).digest('base64url');
}

export function signToken(
  purpose: TokenPurpose,
  data: unknown,
  ttlSeconds: number,
  nowMs: number = Date.now(),
): string {
  const issued = Math.floor(nowMs / 1000);
  const envelope: Envelope = { p: purpose, iat: issued, exp: issued + ttlSeconds, d: data };
  const body = Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64url');
  return `${body}.${sign(purpose, body)}`;
}

export interface VerifiedToken {
  readonly data: unknown;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

/**
 * Null on a bad signature, the wrong purpose, or an expired token — never a
 * throw and never a reason. A caller that could tell "expired" from "forged"
 * would eventually branch on it, and the two deserve the same response.
 */
export function verifyToken(
  purpose: TokenPurpose,
  token: string | undefined | null,
  nowMs: number = Date.now(),
): VerifiedToken | null {
  if (token === undefined || token === null || token === '') return null;

  const separator = token.lastIndexOf('.');
  if (separator <= 0) return null;
  const body = token.slice(0, separator);
  const supplied = Buffer.from(token.slice(separator + 1), 'base64url');

  const expected = Buffer.from(sign(purpose, body), 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  let envelope: Envelope;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    envelope = parsed as Envelope;
  } catch {
    return null;
  }

  if (envelope.p !== purpose) return null;
  if (typeof envelope.exp !== 'number' || typeof envelope.iat !== 'number') return null;

  const now = Math.floor(nowMs / 1000);
  if (now >= envelope.exp) return null;
  // A token from the future is a clock that moved, or a forgery with a valid
  // signature — which cannot happen — so refuse it rather than trust it.
  if (envelope.iat > now + 60) return null;

  return {
    data: envelope.d,
    issuedAt: new Date(envelope.iat * 1000),
    expiresAt: new Date(envelope.exp * 1000),
  };
}
