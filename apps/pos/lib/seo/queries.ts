import 'server-only';

import { eq } from 'drizzle-orm';
import { dbRead, settings } from '@natech/db';
import { parseSeoSettings, SEO_SETTINGS_KEY } from '@natech/branding';

/** Only the explicitly configured storefront URL belongs on invoices. */
export async function readInvoiceStorefrontUrl(): Promise<string | null> {
  const [row] = await dbRead()
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, SEO_SETTINGS_KEY))
    .limit(1);
  return parseSeoSettings(row?.value).siteUrl || null;
}
