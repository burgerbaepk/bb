import type { TerminalFormState } from './actions';

/**
 * Idle `useActionState` value — split out of `actions.ts` because a
 * `'use server'` file may only export async functions (see
 * `lib/auth/actions/session-idle.ts` for the full story; every actions
 * module in this app had the same latent bug, caught only by running the
 * real dev server, not by `tsc` or the mocked test suite).
 */
export const TERMINAL_IDLE: TerminalFormState = { error: null, message: null };
