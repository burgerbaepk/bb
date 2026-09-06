import type { FormState } from './session';

/**
 * The idle `useActionState` value for the §14.2 actions — split out of
 * `session.ts` because a `'use server'` file may export only async functions
 * (Next.js rejects the module outright otherwise: "A 'use server' file can
 * only export async functions, found object"). Nothing in `session.ts`
 * exercises this at build or test time — every action module there is mocked
 * in `test/setup.ts`, and `tsc`/`vitest` have no opinion on the rule — so it
 * only surfaced running the real dev server against the real sign-in form.
 * Every sibling actions module in this app had the same latent bug; see the
 * matching `*-idle.ts` file next to each one.
 */
export const NO_ERROR: FormState = { error: null, nonce: 0 };
