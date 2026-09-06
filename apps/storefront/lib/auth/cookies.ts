import 'server-only';
import { cookies } from 'next/headers';
import { signToken, verifyToken } from '@natech/auth';

/**
 * The customer session cookie — BUILD-PLAN.md §13.3; docs/runfiles/
 * M14-storefront.md §3.
 *
 * Mirrors `apps/pos/lib/auth/cookies.ts`'s shape exactly: a signed token from
 * `@natech/auth`, the expiry that matters carried inside the signature, and
 * `maxAge` only a request to the browser to stop sending an already-dead
 * token. `customer-session` is its own token purpose (`packages/auth/src/
 * env.ts`) — a customer's identity must never be presentable as any staff
 * purpose, or the reverse.
 */
const COOKIE_NAME = 'storefront.session';

const secure = process.env.NODE_ENV === 'production';

export interface SessionClaim {
  readonly webSessionId: string;
}

function asSessionClaim(data: unknown): SessionClaim | null {
  if (typeof data !== 'object' || data === null) return null;
  const webSessionId = Reflect.get(data, 'webSessionId');
  return typeof webSessionId === 'string' && webSessionId !== '' ? { webSessionId } : null;
}

export async function setSessionCookie(webSessionId: string, ttlSeconds: number): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, signToken('customer-session', { webSessionId }, ttlSeconds), {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: ttlSeconds,
  });
}

export async function readSessionCookie(): Promise<SessionClaim | null> {
  const jar = await cookies();
  const token = verifyToken('customer-session', jar.get(COOKIE_NAME)?.value);
  return token === null ? null : asSessionClaim(token.data);
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}
