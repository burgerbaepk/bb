import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { can, type Permission, type Viewer } from '@natech/contracts';
import { auth } from '@/auth';
import { readStaffCookie } from './cookies';
import { idleLockSeconds, loadViewer } from './queries';
import type { RequestContext } from './service';

/**
 * The access layer — BUILD-PLAN.md §14.1, §14.2.
 *
 * §14.1: "Check server-side on every action. Client-side hiding is cosmetic."
 * This module is that check, and it is the only one. Every server action, route
 * handler, and protected page calls into it; nothing decides for itself whether
 * a session looks good enough.
 *
 * It deliberately does not run in middleware. A middleware guard is one header
 * away from being bypassed — CVE-2025-29927 was exactly that — and a redirect
 * in a layout plus a permission check in the action is both safer and closer to
 * the thing being protected. The cost is that an unauthenticated request does
 * a little work before being turned away, which on a till nobody notices.
 *
 * §14.2 splits identity in two and so does this file:
 *
 *   `requireBinding()` — which account bound this terminal for the shift.
 *      The identity behind the back office, where the person at the keyboard
 *      signed in with a password minutes ago.
 *   `requireTillStaff()` — who is at the till right now, re-established with a
 *      PIN after every idle timeout. The actor on an order, a check, a payment.
 */

export class NotSignedIn extends Error {
  constructor() {
    super('No terminal is bound.');
    this.name = 'NotSignedIn';
  }
}

export class Locked extends Error {
  constructor() {
    super('The till is locked. A PIN identifies who is using it.');
    this.name = 'Locked';
  }
}

export class Forbidden extends Error {
  readonly permission: Permission;
  constructor(permission: Permission) {
    super(`This account does not hold ${permission}.`);
    this.name = 'Forbidden';
    this.permission = permission;
  }
}

export interface Binding {
  readonly userId: string;
  readonly terminalId: string;
  readonly terminalLabel: string;
}

/**
 * A misconfigured deployment must not look like an empty one.
 *
 * Auth.js logs `MissingSecret` and hands back `null`, which reads exactly like
 * "nobody is signed in" — so a POS with no `AUTH_SECRET` sends every member of
 * staff to the sign-in screen, accepts a correct password, and returns them to
 * the sign-in screen, with the only evidence in a server log nobody is reading
 * during service. §4 requires the variable; this makes its absence say so.
 */
function assertConfigured(): void {
  const secret = process.env['AUTH_SECRET'];
  if (secret === undefined || secret.length < 32) {
    throw new Error(
      'AUTH_SECRET is not set, or is shorter than 32 characters. No session can be ' +
        'issued or read. See BUILD-PLAN.md §4 and docs/runfiles/M00-provisioning.md.',
    );
  }
}

/** The bound terminal, or null. Never redirects — for surfaces that render both ways. */
export async function currentBinding(): Promise<Binding | null> {
  assertConfigured();
  const session = await auth();
  const user = session?.user;
  if (user === undefined || user.id === '' || user.terminalId === '') return null;
  return { userId: user.id, terminalId: user.terminalId, terminalLabel: user.terminalLabel };
}

export async function requireBinding(): Promise<Binding> {
  const binding = await currentBinding();
  if (binding === null) redirect('/sign-in');
  return binding;
}

/** The account that bound the terminal, with its permissions resolved now. */
export async function requireOperator(knownBinding?: Binding): Promise<Viewer> {
  const binding = knownBinding ?? (await requireBinding());
  const viewer = await loadViewer(binding.userId);
  // Deactivated, deleted, or stripped of every role while signed in. The
  // session is still valid and grants nothing, which is the correct outcome.
  if (viewer === null) redirect('/sign-in?reason=account');
  return viewer;
}

export interface TillIdentity {
  readonly viewer: Viewer;
  readonly binding: Binding;
}

/**
 * Who is at the till — §14.2, re-established by PIN after each idle timeout.
 *
 * The timeout is enforced here, against the issue time inside the signed
 * cookie, and not by the client timer that also watches for it. The timer
 * exists so the screen locks visibly while nobody is touching it; this exists
 * because a client timer is a suggestion.
 */
export async function currentTillIdentity(knownBinding?: Binding): Promise<TillIdentity | null> {
  const binding = knownBinding ?? (await currentBinding());
  if (binding === null) return null;

  const staff = await readStaffCookie();
  if (staff === null) return null;

  const idleFor = (Date.now() - staff.issuedAt.getTime()) / 1000;
  // Both reads are independent and normally cross the Neon HTTP boundary.
  // Keeping them sequential added one full network round trip to every till
  // action and every protected render.
  const [lockSeconds, viewer] = await Promise.all([
    idleLockSeconds(),
    loadViewer(staff.claim.userId),
  ]);
  // ADR 0029 — zero is "never re-lock on idle".
  if (lockSeconds > 0 && idleFor > lockSeconds) return null;
  return viewer === null ? null : { viewer, binding };
}

export async function requireTillStaff(): Promise<TillIdentity> {
  const identity = await currentTillIdentity();
  if (identity === null) {
    const binding = await currentBinding();
    if (binding === null) throw new NotSignedIn();
    throw new Locked();
  }
  return identity;
}

/**
 * The server-side half of §14.1. Throws rather than redirects: a permission
 * failure inside an action is an answer to the caller, not a navigation.
 */
export function assertPermission(viewer: Viewer, permission: Permission): void {
  if (!can(viewer, permission)) throw new Forbidden(permission);
}

/** For a page: the viewer, or a redirect to somewhere they are allowed to be. */
export async function requirePermissionPage(permission: Permission): Promise<Viewer> {
  const viewer = await requireOperator();
  if (!can(viewer, permission)) redirect('/admin?denied=' + encodeURIComponent(permission));
  return viewer;
}

/** R7 — the IP and user agent on every audit and attempt row. */
export async function requestContext(): Promise<RequestContext> {
  const list = await headers();
  const forwarded = list.get('x-forwarded-for');
  return {
    ip: forwarded === null ? list.get('x-real-ip') : (forwarded.split(',')[0]?.trim() ?? null),
    ua: list.get('user-agent'),
  };
}
