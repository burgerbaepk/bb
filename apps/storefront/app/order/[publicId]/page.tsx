import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { LiveOrderStatus } from '@/components/LiveOrderStatus';
import { publicOrderStatus } from '@/lib/orders/queries';

/**
 * Live order status — BUILD-PLAN.md §13.1, §13.4, §16.
 *
 * No `generateStaticParams`: a `publicId` is minted at placement, unbounded,
 * and this route always renders the current row — SSR, not ISR.
 */
export const metadata: Metadata = {
  title: 'Your order',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const order = await publicOrderStatus(publicId);
  if (order === null) notFound();

  return <LiveOrderStatus order={order} />;
}
