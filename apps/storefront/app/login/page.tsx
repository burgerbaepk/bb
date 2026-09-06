import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CheckoutFlow } from '@/components/CheckoutFlow';
import { currentCustomerSession } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } };

export default async function Page() {
  if (await currentCustomerSession()) redirect('/menu');
  return <CheckoutFlow accountMode="SIGN_IN" />;
}
