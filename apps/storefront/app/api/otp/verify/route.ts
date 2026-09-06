import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CartSchema, OtpVerifySchema } from '@natech/contracts';
import { verifyOtp } from '@/lib/auth/otp';
import { SignUpProfileSchema } from '@/lib/auth/signup';
import { createCustomerSession } from '@/lib/auth/session';

/**
 * `POST /api/otp/verify` — BUILD-PLAN.md §13.3, the literal path the plan
 * names. On success, opens the session and seeds it with whatever cart the
 * customer built anonymously before this call — `web_sessions.cart` has to
 * start somewhere, and the client is the only place that cart has existed
 * up to this point (docs/runfiles/M14-storefront.md §2, "session cart").
 *
 * `cart`/`tableToken` are not part of the frozen `OtpVerifySchema` (that
 * contract is exactly `{ email, code }`) — this route's own request body
 * composes it with the cart shape, the same way an action's own input schema
 * (e.g. `PlaceOrderInputSchema`) is local to the file that needs it rather
 * than a `packages/contracts` addition. ADR 0022 composes `profile` in on the
 * same basis: it is the name, phone and address sign-up collects, and this is
 * the only surface that sends them.
 *
 * The profile travels with the code rather than being saved a step earlier, so
 * an unverified email cannot leave a half-built customer row behind it.
 */
const VerifyRequestSchema = OtpVerifySchema.extend({
  cart: CartSchema,
  tableToken: z.string().nullable(),
  /** Absent when an existing customer is re-verifying rather than signing up. */
  profile: SignUpProfileSchema.nullable().default(null),
});

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Malformed request.' }, { status: 400 });
  }

  const parsed = VerifyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the code and try again.' },
      { status: 400 },
    );
  }

  const outcome = await verifyOtp(
    parsed.data.email.trim().toLocaleLowerCase('en-US'),
    parsed.data.code,
    parsed.data.profile,
  );
  if (!outcome.ok) {
    return NextResponse.json({ ok: false, error: outcome.error }, { status: 401 });
  }

  await createCustomerSession(outcome.customerId, parsed.data.cart, parsed.data.tableToken);
  return NextResponse.json({ ok: true });
}
