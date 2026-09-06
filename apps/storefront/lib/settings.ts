import 'server-only';
import { eq } from 'drizzle-orm';
import { dbRead, settings } from '@natech/db';

/**
 * `storefront.sessionDays` — BUILD-PLAN.md §13.3; docs/runfiles/
 * M14-storefront.md §3.
 *
 * Mirrors `apps/pos/lib/tax/queries.ts`'s "one settings row, one JSON value,
 * safe fallback" shape — duplicated rather than imported cross-app, the same
 * category `readSettingValue` already occupies in three other files.
 */
const SESSION_DAYS_KEY = 'storefront.sessionDays';
const DEFAULT_SESSION_DAYS = 90;

export async function readSessionDays(): Promise<number> {
  const rows = await dbRead()
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, SESSION_DAYS_KEY))
    .limit(1);
  const value = rows[0]?.value;
  return typeof value === 'number' && value > 0 ? value : DEFAULT_SESSION_DAYS;
}
