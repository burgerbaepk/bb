'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { dbWrite, settings, writeAudit } from '@natech/db';
import { assertPermission, requestContext, requireOperator } from '../auth/session';
import { BRANDING_SETTINGS_KEY, parseBrandConfig } from './config';

export interface ReceiptSettingsState {
  readonly error: string | null;
  readonly message: string | null;
}

const Input = z.object({
  widthMm: z.enum(['58', '80']),
  showUrdu: z.enum(['true', 'false']),
  headerLines: z.string(),
  footerLines: z.string(),
  bankName: z.string().trim(),
  iban: z.string().trim(),
  accountNumber: z.string().trim(),
  jazzCash: z.string().trim(),
  easyPaisa: z.string().trim(),
});

function lines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6);
}

export async function saveReceiptSettingsAction(
  _previous: ReceiptSettingsState,
  form: FormData,
): Promise<ReceiptSettingsState> {
  const operator = await requireOperator();
  assertPermission(operator, 'settings.write');
  const parsed = Input.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Check the form.', message: null };

  const db = dbWrite();
  const context = await requestContext();
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: settings.id, value: settings.value })
      .from(settings)
      .where(eq(settings.key, BRANDING_SETTINGS_KEY));
    const row = rows[0];
    const before = parseBrandConfig(row?.value);
    const after = {
      ...before,
      receipt: {
        ...before.receipt,
        widthMm: parsed.data.widthMm === '58' ? (58 as const) : (80 as const),
        showUrdu: parsed.data.showUrdu === 'true',
        headerLines: lines(parsed.data.headerLines),
        footerLines: lines(parsed.data.footerLines),
        paymentDetails: {
          bankName: parsed.data.bankName,
          iban: parsed.data.iban,
          accountNumber: parsed.data.accountNumber,
          jazzCash: parsed.data.jazzCash,
          easyPaisa: parsed.data.easyPaisa,
        },
      },
    };
    if (row === undefined)
      await tx
        .insert(settings)
        .values({ key: BRANDING_SETTINGS_KEY, value: after as object, updatedBy: operator.id });
    else
      await tx
        .update(settings)
        .set({ value: after as object, updatedBy: operator.id, updatedAt: new Date() })
        .where(eq(settings.id, row.id));
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'settings',
        action: 'RECEIPT_SETTINGS_UPDATED',
        before: before.receipt,
        after: after.receipt,
      },
    );
  });

  revalidatePath('/', 'layout');
  revalidatePath('/admin/receipt-settings');
  return { error: null, message: 'Receipt and invoice settings saved.' };
}
