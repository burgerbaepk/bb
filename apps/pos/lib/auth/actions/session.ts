'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { signToken } from '@natech/auth';
import { signIn, signOut } from '@/auth';
import { clearStaffCookie, rememberTerminal, setStaffCookie } from '../cookies';
import { listActiveTerminals } from '../queries';
import { currentBinding, requestContext, requireBinding, requireTillStaff } from '../session';
import { verifyPin, verifySignIn } from '../service';

/**
 * The §14.2 actions: bind a terminal, identify a person, re-enter a password.
 *
 * Each returns a message rather than throwing, because each of them is a form
 * a member of staff is looking at. "Wrong PIN, two attempts left" and "locked
 * for another 40 seconds" are different facts and a cashier needs both.
 */

export interface FormState {
  readonly error: string | null;
  /**
   * Distinguishes one rejected attempt from the next.
   *
   * The PIN pad clears itself after a refusal, and two wrong PINs in a row
   * produce the same message — without something that changes, the screen
   * cannot tell the second refusal from the first and leaves the digits up.
   */
  readonly nonce: number;
}

const ok = (): FormState => ({ error: null, nonce: Date.now() });
const fail = (error: string): FormState => ({ error, nonce: Date.now() });

const SignInInput = z.object({
  email: z.string().trim().min(1, 'Enter the email the account was created with.'),
  password: z.string().min(1, 'Enter the password.'),
  terminalId: z.uuid('Choose which till this is.'),
});

/** §14.2 — "Bind a terminal for the shift with email and password." */
export async function signInAction(_previous: FormState, form: FormData): Promise<FormState> {
  const parsed = SignInInput.safeParse({
    email: form.get('email'),
    password: form.get('password'),
    terminalId: form.get('terminalId'),
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? 'Check the form.');
  }

  const terminals = await listActiveTerminals();
  const terminal = terminals.find((option) => option.id === parsed.data.terminalId);
  if (terminal === undefined) return fail('That till is not registered or is not active.');

  const context = await requestContext();
  const result = await verifySignIn({ ...parsed.data, context });

  if (!result.ok) {
    switch (result.reason) {
      case 'LOCKED':
        return fail(
          `Too many attempts. Try again in ${Math.ceil(result.retryAfterSeconds / 60)} minute(s).`,
        );
      case 'INACTIVE':
        return fail('That account has been deactivated.');
      case 'NO_ROLE':
        return fail('That account holds no role. A manager has to assign one.');
      case 'INVALID':
        return fail('That email and password do not match an account.');
    }
  }

  // Never leaves the server: minted here, handed to the provider below, and
  // exchanged for a session inside the same request.
  const handoff = signToken(
    'sign-in-handoff',
    {
      userId: result.userId,
      terminalId: terminal.id,
      terminalLabel: terminal.label,
      displayName: parsed.data.email,
    },
    60,
  );

  await signIn('terminal-binding', { handoff, redirect: false });
  await rememberTerminal(terminal.id);
  // §14.2 keeps binding and identification apart: the shift is bound, and the
  // till stays locked until somebody's PIN says who is standing at it.
  await clearStaffCookie();

  redirect('/');
}

export async function signOutAction(): Promise<void> {
  await clearStaffCookie();
  await signOut({ redirectTo: '/sign-in' });
}

const PinInput = z.object({
  userId: z.uuid(),
  pin: z.string().regex(/^[0-9]{4,6}$/, 'A PIN is 4 to 6 digits.'),
});

/** §14.2 — "Identify individual staff with a 4 to 6 digit PIN per till action." */
export async function unlockAction(_previous: FormState, form: FormData): Promise<FormState> {
  const binding = await currentBinding();
  if (binding === null) redirect('/sign-in');

  const parsed = PinInput.safeParse({ userId: form.get('userId'), pin: form.get('pin') });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Check the PIN.');

  const result = await verifyPin({
    userId: parsed.data.userId,
    pin: parsed.data.pin,
    terminalId: binding.terminalId,
    context: await requestContext(),
  });

  if (!result.ok) {
    if (result.reason === 'LOCKED') {
      return fail(`Locked. Try again in ${result.retryAfterSeconds} seconds.`);
    }
    return fail(
      result.remaining > 0
        ? `Wrong PIN. ${result.remaining} attempt${result.remaining === 1 ? '' : 's'} left.`
        : 'Wrong PIN. The next attempt will lock this account for a minute.',
    );
  }

  await setStaffCookie(result.userId);
  revalidatePath('/', 'layout');
  return ok();
}

/** Ends the identification without ending the shift binding. */
export async function lockAction(): Promise<void> {
  await requireBinding();
  await clearStaffCookie();
  revalidatePath('/', 'layout');
}

/**
 * Extends the identification.
 *
 * §14.2 re-locks "on a configurable idle timeout", and idle is measured from
 * the last real activity — so `IdleWatcher` calls this (throttled) on every
 * burst of activity, which is what separates an idle timeout from an
 * absolute one measured from the PIN unlock alone.
 *
 * It re-establishes who the caller is rather than taking a user id, so a caller
 * cannot extend somebody else's identification by passing their id.
 */
export async function touchIdentityAction(): Promise<void> {
  const { viewer } = await requireTillStaff();
  await setStaffCookie(viewer.id);
}
