import 'server-only';
import { eq } from 'drizzle-orm';
import { dbRead, dbWrite, webSessions } from '@natech/db';
import type { Cart } from '@natech/contracts';
import { readSessionDays } from '../settings';
import { fromStoredCart, toStoredCart } from '../cart/persist';
import { readSessionCookie, setSessionCookie } from './cookies';

/**
 * The customer session — BUILD-PLAN.md §13.3, §5.11; docs/runfiles/
 * M14-storefront.md §3.
 *
 * One `web_sessions` row per sign-in, its own id signed into the cookie
 * (never the customer id directly — the row is what carries `expiresAt` and
 * the persisted cart, and revoking a session means expiring that one row,
 * not rotating a secret). Mirrors ADR 0010's DAL shape: a `currentX()` that
 * never redirects, and a caller decides what "no session" means for it —
 * a route handler returns 401 JSON, an action returns a friendly refusal.
 */
export interface CustomerSession {
  readonly sessionId: string;
  readonly customerId: string;
  readonly cart: Cart | null;
}

export async function createCustomerSession(
  customerId: string,
  initialCart: Cart,
  tableToken: string | null,
): Promise<void> {
  const sessionDays = await readSessionDays();
  const ttlSeconds = sessionDays * 24 * 60 * 60;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  const [row] = await dbWrite()
    .insert(webSessions)
    .values({
      customerId,
      tableToken,
      cart: toStoredCart(initialCart),
      expiresAt,
    })
    .returning({ id: webSessions.id });
  if (row === undefined) throw new Error('Could not open a session.');

  await setSessionCookie(row.id, ttlSeconds);
}

export async function currentCustomerSession(): Promise<CustomerSession | null> {
  const claim = await readSessionCookie();
  if (claim === null) return null;

  const rows = await dbRead()
    .select({
      id: webSessions.id,
      customerId: webSessions.customerId,
      cart: webSessions.cart,
      expiresAt: webSessions.expiresAt,
    })
    .from(webSessions)
    .where(eq(webSessions.id, claim.webSessionId));

  const row = rows[0];
  if (row === undefined || row.customerId === null) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;

  return { sessionId: row.id, customerId: row.customerId, cart: fromStoredCart(row.cart) };
}
