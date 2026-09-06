'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { dbWrite, settings, writeAudit } from '@natech/db';
import { SEO_SETTINGS_KEY, SeoSettingsSchema } from '@natech/branding';
import { assertPermission, requestContext, requireOperator } from '../auth/session';

export async function saveSeoAction(
  _previous: { error: string | null; message: string | null },
  form: FormData,
): Promise<{ error: string | null; message: string | null }> {
  const operator = await requireOperator();
  assertPermission(operator, 'settings.write');
  const parsed = SeoSettingsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? 'Check the SEO settings.', message: null };
  const context = await requestContext();
  await dbWrite().transaction(async (tx) => {
    const [before] = await tx
      .select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, SEO_SETTINGS_KEY));
    await tx
      .insert(settings)
      .values({ key: SEO_SETTINGS_KEY, value: parsed.data, updatedBy: operator.id })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value: parsed.data, updatedBy: operator.id, updatedAt: new Date() },
      });
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'settings',
        action: 'STOREFRONT_SEO_UPDATED',
        before: before?.value,
        after: parsed.data,
      },
    );
  });
  revalidatePath('/admin/settings');
  return {
    error: null,
    message: 'SEO settings saved. The storefront uses them on its next request.',
  };
}
