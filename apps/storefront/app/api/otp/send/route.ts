import { NextResponse } from 'next/server';
import { OtpRequestSchema } from '@natech/contracts';
import { emailIsAvailableForSignUp, sendOtp } from '@/lib/auth/otp';

/**
 * `POST /api/otp/send` — BUILD-PLAN.md §13.3, the literal path the plan
 * names, not a server action (docs/runfiles/M14-storefront.md §3) — a route
 * handler gives the natural place to read the request's own IP for the
 * per-IP rate limit.
 *
 * ADR 0022 — the only thing that asks for a code is sign-up, so an email that
 * already has an account is refused here rather than after the customer has
 * gone to their inbox, fetched six digits, and typed them in to be told they
 * should have used the other tab. It also keeps that send off a limit of three
 * an hour.
 */
function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded !== null) return forwarded.split(',')[0]?.trim() ?? null;
  return request.headers.get('x-real-ip');
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Malformed request.' }, { status: 400 });
  }

  const parsed = OtpRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Enter a valid email.' },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLocaleLowerCase('en-US');
  if (!(await emailIsAvailableForSignUp(email))) {
    return NextResponse.json(
      { ok: false, error: 'An account already exists. Please sign in.' },
      { status: 409 },
    );
  }

  const outcome = await sendOtp(email, clientIp(request));
  if (!outcome.ok) {
    return NextResponse.json(
      { ok: false, error: outcome.error, resendAvailableAt: outcome.resendAvailableAt },
      { status: 429 },
    );
  }

  return NextResponse.json({
    ok: true,
    email,
    expiresAt: outcome.result.expiresAt,
    attemptsRemaining: 5,
    resendAvailableAt: outcome.result.resendAvailableAt,
  });
}
