'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { dbWrite, outletConfig, writeAudit } from '@natech/db';
import { assertPermission, requestContext, requireOperator } from '../auth/session';

export interface OutletFormState {
  readonly error: string | null;
  readonly message: string | null;
}

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value));

const optionalCoordinate = (label: string, minimum: number, maximum: number) =>
  z
    .string()
    .trim()
    .refine(
      (value) =>
        value === '' ||
        (Number.isFinite(Number(value)) && Number(value) >= minimum && Number(value) <= maximum),
      `${label} must be between ${minimum} and ${maximum}.`,
    )
    .transform((value) => (value === '' ? null : value));

const OutletInput = z.object({
  legalName: z.string().trim().min(1, 'Legal name is required.'),
  tradingName: z.string().trim().min(1, 'Trading name is required.'),
  address: z.string().trim().min(1, 'Address is required.'),
  city: z.string().trim().min(1, 'City is required.'),
  phone: z.string().trim().min(1, 'Phone is required.'),
  email: z
    .union([z.literal(''), z.email('Enter a valid email address.')])
    .transform((value) => value || null),
  ntn: z.string().trim(),
  strn: optionalText,
  timezone: z
    .string()
    .trim()
    .min(1, 'Timezone is required.')
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value }).format();
        return true;
      } catch {
        return false;
      }
    }, 'Enter a valid IANA timezone, for example Asia/Karachi.'),
  businessDayCutoff: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Choose a valid business-day cutoff.'),
  latitude: optionalCoordinate('Latitude', -90, 90),
  longitude: optionalCoordinate('Longitude', -180, 180),
  storeOpen: z
    .union([z.literal(''), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)])
    .transform((value) => value || null),
  storeClose: z
    .union([z.literal(''), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)])
    .transform((value) => value || null),
  /**
   * The Google Business listing the storefront renders a review QR and score
   * from. A place ID is opaque and Google's own format has changed over time,
   * so this validates only that it is non-empty rather than pinning a shape a
   * future listing would fail.
   */
  googlePlaceId: optionalText,
  googleRating: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 5),
      'Google rating must be between 0 and 5.',
    )
    .transform((value) => (value === '' ? null : value)),
  googleReviewCount: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || (Number.isInteger(Number(value)) && Number(value) >= 0),
      'Google review count must be a whole number.',
    )
    .transform((value) => (value === '' ? null : Number(value))),
  weeklyOffDays: z.string().transform((value, context) => {
    const allowed = new Set([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
    const days = value
      .split(',')
      .map((day) => day.trim())
      .filter(Boolean);
    if (days.some((day) => !allowed.has(day))) {
      context.addIssue({
        code: 'custom',
        message: 'Weekly off days must be full weekday names separated by commas.',
      });
      return z.NEVER;
    }
    return days.length === 0 ? null : [...new Set(days)];
  }),
});

export async function saveOutletAction(
  _previous: OutletFormState,
  form: FormData,
): Promise<OutletFormState> {
  const operator = await requireOperator();
  assertPermission(operator, 'settings.write');

  const parsed = OutletInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form.', message: null };
  }

  const context = await requestContext();
  const values = parsed.data;
  const db = dbWrite();

  await db.transaction(async (tx) => {
    // Include a soft-deleted row: the singleton unique index still owns `true`,
    // so provisioning must restore that row instead of attempting an insert.
    const rows = await tx.select().from(outletConfig).where(eq(outletConfig.singleton, true));
    const before = rows[0];
    let entityId: string;

    if (before === undefined) {
      const inserted = await tx
        .insert(outletConfig)
        .values({ ...values, singleton: true })
        .returning({ id: outletConfig.id });
      const created = inserted[0];
      if (created === undefined) throw new Error('Creating outlet_config returned no row.');
      entityId = created.id;
    } else {
      entityId = before.id;
      await tx
        .update(outletConfig)
        .set({ ...values, singleton: true, deletedAt: null, updatedAt: new Date() })
        .where(eq(outletConfig.id, before.id));
    }

    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'outlet_config',
        entityId,
        action: before === undefined ? 'OUTLET_CONFIG_CREATED' : 'OUTLET_CONFIG_UPDATED',
        before: before === undefined ? undefined : { ...before, id: undefined },
        after: values,
      },
    );
  });

  revalidatePath('/', 'layout');
  revalidatePath('/admin/outlet');
  return { error: null, message: 'Outlet settings saved.' };
}
