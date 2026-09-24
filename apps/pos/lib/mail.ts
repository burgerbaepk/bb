import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { Resend } from 'resend';
import { dbRead, roles, userRoles, users } from '@natech/db';
import { readOutletEmail } from './outlet/queries';

/**
 * The one owner-facing Resend send — BUILD-PLAN.md §12, §14.1; ADR 0026.
 *
 * Two reports leave the building: the Z report at shift close
 * (`lib/shifts/report.ts`) and a submitted demand sheet
 * (`lib/demand/actions.ts`). Both go to the same people, so the recipient
 * question is answered once here rather than twice in two modules that would
 * then drift the first time an owner account is added.
 *
 * Recipients are resolved from the database, never configured: whoever holds
 * the OWNER role at the moment of sending is who receives it. A departed owner
 * whose account was deactivated stops receiving the takings the same day their
 * account is switched off, which is the whole reason this is a query and not
 * an environment variable.
 */

/**
 * The vendor's own copy of the daily operations report — NA Technologies, who
 * support the deployment. Not restaurant identity (R12 governs the outlet's
 * name, NTN, STRN, address, phone and brand hex, all of which stay in
 * `outlet_config`), so it is a constant rather than deployment data: it is the
 * same mailbox for every client, and a per-deployment override would be a
 * setting nobody would ever set differently.
 */
export const VENDOR_REPORT_INBOX = 'mail@najam.me';

function resendClient(): Resend | null {
  const apiKey = process.env['RESEND_API_KEY'];
  return apiKey === undefined || apiKey === '' ? null : new Resend(apiKey);
}

/**
 * Every active OWNER's email address.
 *
 * `innerJoin` on both hops, so a user with no role or a soft-deleted grant
 * cannot appear — the same join shape `lib/auth/queries.ts` uses to build an
 * account's role list, narrowed to one key. Deduplicated because a user may
 * hold OWNER through more than one grant row.
 */
export async function readOwnerEmails(): Promise<string[]> {
  const rows = await dbRead()
    .select({ email: users.email })
    .from(users)
    .innerJoin(userRoles, and(eq(userRoles.userId, users.id), isNull(userRoles.deletedAt)))
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.deletedAt)))
    .where(and(eq(roles.key, 'OWNER'), eq(users.isActive, true), isNull(users.deletedAt)));
  return [...new Set(rows.map((row) => row.email.trim().toLowerCase()))];
}

/**
 * Send a report to the owners, skipping rather than throwing when it cannot.
 *
 * Mirrors `lib/fiscal/reconciliation.ts` and the storefront's OTP send: an
 * unconfigured `RESEND_API_KEY`/`RESEND_FROM_TRANSACTIONAL` must not turn a
 * committed shift close or a frozen demand sheet into a visible failure. The
 * boolean says whether it went, for a caller that wants to log it.
 *
 * `outlet_config.email` is the fallback and only the fallback. Before an OWNER
 * account exists (a fresh deployment, §14.6's `auth:owner` not yet run) the Z
 * report still has somewhere to go; once one does, the report follows the
 * person, not the shared mailbox.
 */
export async function sendOwnerReport(
  subject: string,
  text: string,
  alsoTo: readonly string[] = [],
  /** ADR 0029 — the designed body; `text` stays as the plain-text part. */
  html?: string,
): Promise<boolean> {
  const client = resendClient();
  const from = process.env['RESEND_FROM_TRANSACTIONAL'];
  if (client === null || from === undefined || from === '') return false;

  const owners = await readOwnerEmails();
  const fallback = owners.length === 0 ? await readOutletEmail() : null;
  const to = [
    ...new Set([
      ...owners,
      ...(fallback === null ? [] : [fallback.trim().toLowerCase()]),
      ...alsoTo.map((address) => address.trim().toLowerCase()),
    ]),
  ];
  if (to.length === 0) return false;

  const { error } = await client.emails.send({
    from,
    to,
    subject,
    text,
    ...(html === undefined ? {} : { html }),
  });
  // Resend answers a rejected send (bad sender domain, quota) with `error`
  // rather than throwing, so without this a refused email read as delivered.
  if (error !== null) {
    console.error('sendOwnerReport: Resend refused the email', error);
    return false;
  }
  return true;
}
