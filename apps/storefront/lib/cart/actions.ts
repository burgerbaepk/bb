'use server';

import { eq } from 'drizzle-orm';
import { dbWrite, webSessions } from '@natech/db';
import { CartSchema } from '@natech/contracts';
import { currentCustomerSession } from '../auth/session';
import { toStoredCart } from './persist';

/**
 * Session cart persistence — BUILD-PLAN.md §5.11; docs/runfiles/
 * M14-storefront.md §3.
 *
 * A no-op before a session exists (anonymous browsing keeps the cart in
 * component state only, unchanged since M06) — every caller fires this after
 * every cart mutation regardless, and the DAL decides for itself whether
 * there is anything to persist, rather than the client tracking that.
 */
export async function saveCartAction(input: unknown): Promise<void> {
  const parsed = CartSchema.safeParse(input);
  if (!parsed.success) return;

  const session = await currentCustomerSession();
  if (session === null) return;

  await dbWrite()
    .update(webSessions)
    .set({ cart: toStoredCart(parsed.data), updatedAt: new Date() })
    .where(eq(webSessions.id, session.sessionId));
}
