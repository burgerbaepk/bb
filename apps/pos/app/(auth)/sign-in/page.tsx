import { SignInForm } from '@/components/auth/SignInForm';
import { rememberedTerminal } from '@/lib/auth/cookies';
import { listActiveTerminals } from '@/lib/auth/queries';

/**
 * §14.2 — "Bind a terminal for the shift with email and password."
 *
 * `?reason=account` arrives from the access layer when a session is still
 * cryptographically valid but the account behind it has been deactivated,
 * deleted, or stripped of every role since it was issued. Saying so is better
 * than a sign-in form that silently rejects a correct password.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [terminals, remembered, params] = await Promise.all([
    listActiveTerminals(),
    rememberedTerminal(),
    searchParams,
  ]);

  const notice =
    params['reason'] === 'account'
      ? 'That account is no longer active, or no longer holds a role. Ask a manager.'
      : null;

  return <SignInForm terminals={terminals} defaultTerminalId={remembered} notice={notice} />;
}
