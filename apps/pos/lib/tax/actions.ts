'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { dbWrite, settingHistory, settings, writeAudit } from '@natech/db';
import { DEFAULT_TAX_POLICY } from '@natech/domain';
import { assertPermission, requestContext, requireOperator } from '../auth/session';

const TAX_POLICY_KEY = 'tax.policy';
const Input = z.object({
  taxEnabled: z.enum(['true', 'false']),
  enabled: z.enum(['true', 'false']),
  posFeeEnabled: z.enum(['true', 'false']),
  defaultBps: z.coerce.number().int().min(0).max(10_000),
  reason: z.string().trim().min(1, 'Enter a reason for changing billing policy.'),
});

export interface ServiceChargeSettingsState {
  readonly error: string | null;
  readonly message: string | null;
}

export async function saveServiceChargeSettingsAction(
  _previous: ServiceChargeSettingsState,
  form: FormData,
): Promise<ServiceChargeSettingsState> {
  const operator = await requireOperator();
  assertPermission(operator, 'settings.tax.write');
  const parsed = Input.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form.', message: null };
  }

  const db = dbWrite();
  const context = await requestContext();
  await db.transaction(async (tx) => {
    const row = await tx
      .select({ id: settings.id, value: settings.value })
      .from(settings)
      .where(eq(settings.key, TAX_POLICY_KEY))
      // M21 — this form and the settings registry both read-modify-write the
      // one `tax.policy` blob. Without the lock, a manager saving billing here
      // while another changes the rounding mode in the registry both read the
      // old object, and whichever commits second silently discards the other's
      // field. No error, no trace, and a tax setting that reverts for no
      // visible reason.
      .for('update')
      .then((rows) => rows[0]);
    const before =
      typeof row?.value === 'object' && row.value !== null
        ? (row.value as Record<string, unknown>)
        : ({ ...DEFAULT_TAX_POLICY, posFeePaisa: String(DEFAULT_TAX_POLICY.posFeePaisa) } as Record<
            string,
            unknown
          >);
    const after = {
      ...before,
      taxEnabled: parsed.data.taxEnabled === 'true',
      serviceChargeEnabled: parsed.data.enabled === 'true',
      serviceChargeBps: parsed.data.defaultBps,
      posFeeEnabled: parsed.data.posFeeEnabled === 'true',
      posFeePaisa:
        parsed.data.posFeeEnabled === 'true' ? String(DEFAULT_TAX_POLICY.posFeePaisa) : '0',
    };

    if (row === undefined) {
      await tx
        .insert(settings)
        .values({ key: TAX_POLICY_KEY, value: after, updatedBy: operator.id });
    } else {
      await tx
        .update(settings)
        .set({ value: after, updatedBy: operator.id, updatedAt: new Date() })
        .where(eq(settings.id, row.id));
    }
    await tx.insert(settingHistory).values({
      key: TAX_POLICY_KEY,
      before,
      after,
      actorId: operator.id,
      reason: parsed.data.reason,
    });
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'settings',
        entityId: row?.id,
        action: 'SERVICE_CHARGE_POLICY_UPDATED',
        before: {
          taxEnabled: before['taxEnabled'] ?? true,
          enabled: before['serviceChargeEnabled'] ?? true,
          defaultBps: before['serviceChargeBps'],
          posFeeEnabled: before['posFeeEnabled'] ?? true,
        },
        after: {
          taxEnabled: after.taxEnabled,
          enabled: after.serviceChargeEnabled,
          defaultBps: after.serviceChargeBps,
          posFeeEnabled: after.posFeeEnabled,
        },
      },
    );
  });

  revalidatePath('/', 'layout');
  revalidatePath('/admin/settings');
  return { error: null, message: 'Billing settings saved.' };
}
