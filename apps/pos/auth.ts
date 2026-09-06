import NextAuth, { type NextAuthResult } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verifyToken } from '@natech/auth';

/**
 * Auth.js v5 — BUILD-PLAN.md §18 M07, §14.2.
 *
 * The session here answers exactly one question: **which account bound this
 * terminal, and which terminal is it**. That is the first half of §14.2. The
 * second half — which member of staff is at the till right now — is not in the
 * session, because it has a different lifetime: the binding lasts a shift and
 * the identification lasts until the next idle timeout. It lives in a separate
 * signed cookie (`lib/auth/cookies.ts`).
 *
 * **The provider never sees a password.** Verification happens in
 * `lib/auth/service.ts`, which can distinguish five outcomes — wrong password,
 * unknown account, deactivated, no role, locked out — and say something true
 * on screen about each. It then mints a 60-second handoff token that this
 * provider exchanges for a session. The token is created and consumed inside
 * one server action and never reaches a browser.
 *
 * Passing the password through `authorize()` instead would mean funnelling all
 * five outcomes through the one error channel a beta credentials provider
 * offers, and answering "sorry, that didn't work" to a cashier who is actually
 * locked out for another twelve minutes.
 */

/** A shift, plus the overrun that every shift has. §14.2 re-locks on idle regardless. */
const SHIFT_SECONDS = 16 * 60 * 60;

export interface HandoffClaim {
  readonly userId: string;
  readonly terminalId: string;
  readonly terminalLabel: string;
  readonly displayName: string;
}

function asHandoff(data: unknown): HandoffClaim | null {
  if (typeof data !== 'object' || data === null) return null;
  const userId = Reflect.get(data, 'userId');
  const terminalId = Reflect.get(data, 'terminalId');
  const terminalLabel = Reflect.get(data, 'terminalLabel');
  const displayName = Reflect.get(data, 'displayName');
  if (typeof userId !== 'string' || userId === '') return null;
  if (typeof terminalId !== 'string' || terminalId === '') return null;
  if (typeof terminalLabel !== 'string') return null;
  if (typeof displayName !== 'string') return null;
  return { userId, terminalId, terminalLabel, displayName };
}

/**
 * The explicit annotation is not decoration. Auth.js v5 infers a result type
 * that names internals of '@auth/core', which TypeScript cannot write into a
 * declaration file from here (TS2883). Naming the published type fixes it.
 */
const nextAuth: NextAuthResult = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt', maxAge: SHIFT_SECONDS },
  pages: { signIn: '/sign-in' },
  providers: [
    Credentials({
      id: 'terminal-binding',
      name: 'Terminal binding',
      credentials: { handoff: { label: 'Handoff', type: 'text' } },
      authorize: (credentials) => {
        const raw = credentials['handoff'];
        const claim =
          typeof raw === 'string' ? asHandoff(verifyToken('sign-in-handoff', raw)?.data) : null;
        if (claim === null) return null;

        return {
          id: claim.userId,
          name: claim.displayName,
          terminalId: claim.terminalId,
          terminalLabel: claim.terminalLabel,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user !== undefined && 'terminalId' in user) {
        token['terminalId'] = String(user.terminalId);
        token['terminalLabel'] = String(Reflect.get(user, 'terminalLabel') ?? '');
      }
      return token;
    },
    session({ session, token }) {
      // Deliberately not the permissions. Those are resolved from the database
      // on every request that needs them (`lib/auth/queries.ts`), so removing a
      // role takes effect immediately rather than at the end of a 16-hour shift.
      session.user.id = typeof token.sub === 'string' ? token.sub : '';
      session.user.terminalId = typeof token['terminalId'] === 'string' ? token['terminalId'] : '';
      session.user.terminalLabel =
        typeof token['terminalLabel'] === 'string' ? token['terminalLabel'] : '';
      return session;
    },
  },
});

export const handlers: NextAuthResult['handlers'] = nextAuth.handlers;
export const signIn: NextAuthResult['signIn'] = nextAuth.signIn;
export const signOut: NextAuthResult['signOut'] = nextAuth.signOut;
export const auth: NextAuthResult['auth'] = nextAuth.auth;
