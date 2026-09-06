import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { verifySecret } from '@natech/auth';
import { customers, dbWrite } from '@natech/db';

export type PasswordAuthResult =
  | { readonly ok: true; readonly customerId: string }
  | { readonly ok: false; readonly error: string };

/**
 * Sign-in for a returning customer — BUILD-PLAN.md §13.3; ADR 0022.
 *
 * Registration used to live here too, and it is gone: an account is created by
 * `verifyOtp` now, because §13.3 requires the email be proven before one exists
 * and because the name, phone and address sign-up collects have to be written
 * in the same statement as the row itself. Two functions that could both mint a
 * customer is two places for those fields to be forgotten.
 *
 * The refusal is deliberately the same string whether the email is unknown, has
 * no password, or has the wrong one. Distinguishing them turns this into a way
 * to ask which email addresses hold accounts.
 */
export async function authenticateCustomer(
  rawEmail: string,
  password: string,
): Promise<PasswordAuthResult> {
  const email = rawEmail.trim().toLocaleLowerCase('en-US');
  const rows = await dbWrite()
    .select({ id: customers.id, passwordHash: customers.passwordHash })
    .from(customers)
    .where(and(eq(customers.email, email), isNull(customers.deletedAt)))
    .limit(1);

  const customer = rows[0];
  if (customer === undefined || customer.passwordHash === null) {
    return { ok: false, error: 'Email or password is incorrect.' };
  }

  const valid = await verifySecret(password, customer.passwordHash);
  return valid
    ? { ok: true, customerId: customer.id }
    : { ok: false, error: 'Email or password is incorrect.' };
}
