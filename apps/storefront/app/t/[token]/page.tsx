import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { QrEntry } from '@/components/QrEntry';
import { recordQrScan, resolveQrToken } from '@/lib/tables/queries';

/**
 * QR entry — BUILD-PLAN.md §13.1, §13.4, §5.11.
 *
 * The token resolves a table and binds it to the session, which is what puts
 * a web order on the right table when it reaches the POS tray. An inactive
 * token is a real case — a table is retired, a code is reprinted — and it
 * gets a plain explanation rather than a 404, because the customer is
 * standing in the restaurant with a phone in their hand.
 *
 * No `generateStaticParams`: tokens are operator-managed at runtime
 * (`qr_tokens`, printed and reprinted from admin), not build-time content.
 */
export const metadata: Metadata = {
  title: 'Order at your table',
  robots: { index: false, follow: false },
};

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolution = await resolveQrToken(token);
  if (resolution === null) notFound();

  void recordQrScan(token);

  return <QrEntry resolution={resolution} />;
}
