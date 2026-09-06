import type { Metadata } from 'next';
import { CheckoutFlow } from '@/components/CheckoutFlow';
import { currentCustomerSession } from '@/lib/auth/session';

/**
 * Cart and password sign-in — returning users keep a long-lived session.
 *
 * Noindex: it is a customer's own order, not a page for a search engine.
 */
export const metadata: Metadata = {
  title: 'Your order',
  robots: { index: false, follow: false },
};

export default async function Page() {
  const session = await currentCustomerSession();
  return <CheckoutFlow signedIn={session !== null} />;
}
