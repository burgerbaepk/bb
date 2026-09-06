import type { StaffFormState } from './staff';

/**
 * Idle `useActionState` value for the staff actions — split out of
 * `staff.ts` for the same reason `session-idle.ts` is split out of
 * `session.ts`: a `'use server'` file may export only async functions.
 */
export const STAFF_IDLE: StaffFormState = { error: null, message: null };
