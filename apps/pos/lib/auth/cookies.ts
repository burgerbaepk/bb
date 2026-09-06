import 'server-only';
import { cookies } from 'next/headers';
import { signToken, verifyToken, type TokenPurpose } from '@natech/auth';

/**
 * The two §14.2 cookies, and one convenience.
 *
 * Each of the two carries a signed token from `@natech/auth`, and the expiry
 * that matters is the one inside the signature — the `maxAge` below is only a
 * request to the browser to stop sending a token that is already dead.
 *
 * `terminal` is not one of the two. It remembers which till this device is,
 * so a cashier signing in at the start of a shift is not choosing from a
 * dropdown every morning. It grants nothing: the bound terminal is whatever
 * the signed-in session says it is, and this only pre-selects the control.
 */

const NAMES = {
  staff: 'pos.staff',
  terminal: 'pos.terminal',
} as const;

/** An upper bound. The configurable idle timeout is enforced against `iat`. */
export const STAFF_TOKEN_TTL_SECONDS = 16 * 60 * 60;

const secure = process.env.NODE_ENV === 'production';

async function put(
  name: string,
  purpose: TokenPurpose,
  data: unknown,
  ttlSeconds: number,
): Promise<void> {
  const jar = await cookies();
  jar.set(name, signToken(purpose, data, ttlSeconds), {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: ttlSeconds,
  });
}

async function take(name: string, purpose: TokenPurpose) {
  const jar = await cookies();
  return verifyToken(purpose, jar.get(name)?.value);
}

async function drop(name: string): Promise<void> {
  const jar = await cookies();
  jar.delete(name);
}

/* --------------------------------------------------- the identified staff */

export interface StaffClaim {
  readonly userId: string;
}

function asStaffClaim(data: unknown): StaffClaim | null {
  if (typeof data !== 'object' || data === null) return null;
  const userId = Reflect.get(data, 'userId');
  return typeof userId === 'string' && userId !== '' ? { userId } : null;
}

/**
 * Issue or refresh the till identity. Called on PIN unlock, and by
 * `touchIdentityAction` on every throttled burst of activity
 * (`IdleWatcher.tsx`) — which is what makes the timeout an *idle* timeout
 * rather than one absolute from the unlock.
 */
export async function setStaffCookie(userId: string): Promise<void> {
  await put(NAMES.staff, 'staff-unlock', { userId }, STAFF_TOKEN_TTL_SECONDS);
}

export async function readStaffCookie(): Promise<{
  readonly claim: StaffClaim;
  readonly issuedAt: Date;
} | null> {
  const token = await take(NAMES.staff, 'staff-unlock');
  if (token === null) return null;
  const claim = asStaffClaim(token.data);
  return claim === null ? null : { claim, issuedAt: token.issuedAt };
}

export async function clearStaffCookie(): Promise<void> {
  await drop(NAMES.staff);
}

/* ------------------------------------------------- which till this device is */

export async function rememberTerminal(terminalId: string): Promise<void> {
  const jar = await cookies();
  jar.set(NAMES.terminal, terminalId, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
  });
}

export async function rememberedTerminal(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(NAMES.terminal)?.value ?? null;
}
