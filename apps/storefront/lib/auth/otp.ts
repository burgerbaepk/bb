import 'server-only';
import { randomInt } from 'node:crypto';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { customers, dbWrite, otpCodes } from '@natech/db';
import type { SignUpProfile } from './signup';
import { hashSecret, verifySecret } from '@natech/auth';
import { Resend } from 'resend';

/**
 * Email OTP — BUILD-PLAN.md §13.3; docs/runfiles/M14-storefront.md §3.
 *
 * Six digits, ten-minute TTL, single use, five verify attempts before the
 * code burns. Rate limits (3 sends per email per hour, 5 per IP per hour)
 * read `otp_codes` directly — no new table. The code itself never appears in
 * a log or a response body; only its lifecycle does.
 *
 * ADR 0022 restored this to the flow. It was built in M14 to §13.3 and then
 * unwired when password sign-in landed, complete and unreachable: the routes,
 * the table, the rate limits and the attempt burn were all still here. Sign-up
 * goes back through it, and carries the name, phone and address with it —
 * `verifyOtp` is the one place a customer row is created from the storefront,
 * so it is the one place those can be written without a second write path to
 * keep in step.
 */
const CODE_TTL_MINUTES = 10;
const MAX_VERIFY_ATTEMPTS = 5;
const MAX_SENDS_PER_EMAIL_PER_HOUR = 3;
const MAX_SENDS_PER_IP_PER_HOUR = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const ONE_HOUR_MS = 60 * 60 * 1000;

function otpPepper(): string {
  const value = process.env['OTP_PEPPER'];
  if (value === undefined || value.length < 32) {
    throw new Error('OTP_PEPPER must be set to at least 32 characters.');
  }
  return value;
}

function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export interface OtpSendResult {
  readonly expiresAt: Date;
  readonly resendAvailableAt: Date;
}

export type SendOtpOutcome =
  | { readonly ok: true; readonly result: OtpSendResult }
  | { readonly ok: false; readonly error: string; readonly resendAvailableAt: Date };

/** `ip` is `null` when the request carried none — the per-IP cap simply does not apply to that send. */
export async function sendOtp(email: string, ip: string | null): Promise<SendOtpOutcome> {
  if (process.env.NODE_ENV === 'production' && !mailerConfigured()) {
    return {
      ok: false,
      error: 'Codes cannot be sent right now. Please order at the counter.',
      resendAvailableAt: new Date(),
    };
  }

  const db = dbWrite();
  const since = new Date(Date.now() - ONE_HOUR_MS);

  const emailSends = await db
    .select({ createdAt: otpCodes.createdAt })
    .from(otpCodes)
    .where(and(eq(otpCodes.email, email), gt(otpCodes.createdAt, since)))
    .orderBy(otpCodes.createdAt);

  const lastSend = emailSends[emailSends.length - 1];
  const cooldownUntil =
    lastSend === undefined
      ? new Date(0)
      : new Date(lastSend.createdAt.getTime() + RESEND_COOLDOWN_SECONDS * 1000);
  if (cooldownUntil.getTime() > Date.now()) {
    return {
      ok: false,
      error: 'Wait a moment before requesting another code.',
      resendAvailableAt: cooldownUntil,
    };
  }

  if (emailSends.length >= MAX_SENDS_PER_EMAIL_PER_HOUR) {
    const oldest = emailSends[0];
    const resendAvailableAt =
      oldest === undefined
        ? new Date(Date.now() + ONE_HOUR_MS)
        : new Date(oldest.createdAt.getTime() + ONE_HOUR_MS);
    return {
      ok: false,
      error: 'Too many codes sent to this address. Try again later.',
      resendAvailableAt,
    };
  }

  if (ip !== null) {
    const ipSends = await db
      .select({ createdAt: otpCodes.createdAt })
      .from(otpCodes)
      .where(and(eq(otpCodes.ip, ip), gt(otpCodes.createdAt, since)));
    if (ipSends.length >= MAX_SENDS_PER_IP_PER_HOUR) {
      return {
        ok: false,
        error: 'Too many codes requested from this connection. Try again later.',
        resendAvailableAt: new Date(Date.now() + ONE_HOUR_MS),
      };
    }
  }

  const code = generateCode();
  const codeHash = await hashSecret(code + otpPepper());
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

  await db.insert(otpCodes).values({ email, codeHash, expiresAt, ip });
  await sendOtpEmail(email, code);

  return {
    ok: true,
    result: { expiresAt, resendAvailableAt: new Date(Date.now() + RESEND_COOLDOWN_SECONDS * 1000) },
  };
}

let resendClient: Resend | null | undefined;

function client(): Resend | null {
  if (resendClient !== undefined) return resendClient;
  const apiKey = process.env['RESEND_API_KEY'];
  resendClient = apiKey === undefined || apiKey === '' ? null : new Resend(apiKey);
  return resendClient;
}

/**
 * Whether a code can actually reach anybody.
 *
 * ADR 0022 made this load-bearing. While OTP was optional, an unconfigured
 * mailer skipping the send was a convenience — the flow could be exercised in
 * review without a real mail. Now it is the only way an account is created, and
 * a silent skip means a green "code sent" screen above a box that can never be
 * filled in, which is worse than a refusal because the customer keeps trying.
 */
function mailerConfigured(): boolean {
  const from = process.env['RESEND_FROM_OTP'];
  return client() !== null && from !== undefined && from !== '';
}

/**
 * Skips rather than throws with no `RESEND_API_KEY`/`RESEND_FROM_OTP`
 * configured — the same guard every other Resend send in this codebase
 * uses (`lib/shifts/report.ts`, `lib/fiscal/reconciliation.ts`). `sendOtp`
 * refuses outright before reaching here in production; this remains so a
 * development machine with no mail credentials can still walk the flow, with
 * the code readable in the `otp_codes` row.
 */
async function sendOtpEmail(email: string, code: string): Promise<void> {
  const resend = client();
  const from = process.env['RESEND_FROM_OTP'];
  if (resend === null || from === undefined || from === '') return;

  await resend.emails.send({
    from,
    to: email,
    subject: `Your order code: ${code}`,
    text: `Your code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes and can only be used once.`,
  });
}

export type VerifyOtpOutcome =
  | { readonly ok: true; readonly customerId: string }
  | { readonly ok: false; readonly error: string };

/**
 * Whether this email can still be signed up, and why not when it cannot.
 *
 * Checked *before* a code is sent rather than after it is entered: mailing a
 * code to someone whose account already exists costs them a round trip to learn
 * they should have used the other tab, and costs the rate limiter a send.
 *
 * An email with a row but no `password_hash` is an OTP-era customer (or one the
 * till created by phone). They are not "already registered" — signing up is how
 * they get a password, which is what `authenticateOrRegisterCustomer` did for
 * this case before ADR 0022 and what `verifyOtp` does for it now.
 */
export async function emailIsAvailableForSignUp(email: string): Promise<boolean> {
  const rows = await dbWrite()
    .select({ passwordHash: customers.passwordHash })
    .from(customers)
    .where(and(eq(customers.email, email), isNull(customers.deletedAt)))
    .limit(1);
  return rows[0]?.passwordHash == null;
}

/**
 * `profile` is present only on a sign-up. A returning customer re-verifying an
 * email has nothing new to tell us, and overwriting their saved address with
 * `null` would be a regression dressed as an update.
 *
 * `# ponytail: two sign-ups racing on the same new mobile number both clear the
 * pre-check below and one loses to customers_phone_idx — surfaces as an
 * unhandled unique violation, not a silent duplicate. Same call, and the same
 * upgrade path, as setOrderCustomerAction (ADR 0016): onConflictDoUpdate
 * against the partial index, if it is ever actually observed.`
 */
export async function verifyOtp(
  email: string,
  code: string,
  profile: SignUpProfile | null = null,
): Promise<VerifyOtpOutcome> {
  const db = dbWrite();

  const rows = await db
    .select({
      id: otpCodes.id,
      codeHash: otpCodes.codeHash,
      attemptCount: otpCodes.attemptCount,
    })
    .from(otpCodes)
    .where(
      and(
        eq(otpCodes.email, email),
        isNull(otpCodes.consumedAt),
        gt(otpCodes.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);

  const pending = rows[0];
  if (pending === undefined) {
    return { ok: false, error: 'That code has expired. Request a new one.' };
  }
  if (pending.attemptCount >= MAX_VERIFY_ATTEMPTS) {
    return { ok: false, error: 'Too many attempts. Request a new code.' };
  }

  const correct = await verifySecret(code + otpPepper(), pending.codeHash);
  if (!correct) {
    await db
      .update(otpCodes)
      .set({ attemptCount: pending.attemptCount + 1 })
      .where(eq(otpCodes.id, pending.id));
    return { ok: false, error: 'Incorrect code.' };
  }

  const existing = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.email, email), isNull(customers.deletedAt)))
    .limit(1);
  const customerId = existing[0]?.id;

  // The phone is unique across every customer the till has ever seen, not just
  // storefront ones, so this has to be checked against the whole table.
  if (profile !== null) {
    const phoneOwner = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.phone, profile.phone), isNull(customers.deletedAt)))
      .limit(1);
    const owner = phoneOwner[0];
    if (owner !== undefined && owner.id !== customerId) {
      return { ok: false, error: 'That mobile number is already registered.' };
    }
  }

  // Burned only once the write below is certain to be attempted: a code spent
  // on a refusal the customer cannot act on is a code they have to request
  // again, against a limit of three an hour.
  await db.update(otpCodes).set({ consumedAt: new Date() }).where(eq(otpCodes.id, pending.id));

  const profileColumns =
    profile === null
      ? {}
      : {
          name: profile.name,
          phone: profile.phone,
          address: profile.address,
          passwordHash: await hashSecret(profile.password),
        };

  if (customerId !== undefined) {
    await db
      .update(customers)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date(), ...profileColumns })
      .where(eq(customers.id, customerId));
    return { ok: true, customerId };
  }

  const [inserted] = await db
    .insert(customers)
    .values({ email, emailVerifiedAt: new Date(), ...profileColumns })
    .returning({ id: customers.id });
  if (inserted === undefined) throw new Error('Could not create a customer record.');
  return { ok: true, customerId: inserted.id };
}
