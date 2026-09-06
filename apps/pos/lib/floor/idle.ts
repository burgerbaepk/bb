import type { FloorFormState } from './actions';

/**
 * Idle `useActionState` value — split out of `actions.ts` because a
 * `'use server'` file may only export async functions (see
 * `lib/auth/actions/session-idle.ts` for the full story).
 */
export const FLOOR_IDLE: FloorFormState = { error: null, message: null };
