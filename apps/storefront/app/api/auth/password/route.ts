import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CartSchema } from '@natech/contracts';
import { authenticateCustomer } from '@/lib/auth/password';
import { createCustomerSession } from '@/lib/auth/session';

/**
 * `POST /api/auth/password` — sign-in only since ADR 0022. `mode` is gone with
 * the registration branch it selected: creating an account now requires a code
 * from `/api/otp/verify`, so there is no longer a way in here that skips §13.3.
 */
const PasswordAuthRequestSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6, 'Password must contain at least 6 characters.').max(128),
  cart: CartSchema,
  tableToken: z.string().nullable(),
});

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Malformed request.' }, { status: 400 });
  }

  const parsed = PasswordAuthRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? 'Check your details.' },
      { status: 400 },
    );
  }

  const result = await authenticateCustomer(parsed.data.email, parsed.data.password);
  if (!result.ok) return NextResponse.json(result, { status: 401 });

  await createCustomerSession(result.customerId, parsed.data.cart, parsed.data.tableToken);
  return NextResponse.json({ ok: true });
}
