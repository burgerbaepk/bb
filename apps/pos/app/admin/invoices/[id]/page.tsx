import { notFound } from 'next/navigation';
import { isNull } from 'drizzle-orm';
import { dbRead, outletConfig } from '@natech/db';
import type { OutletConfig } from '@natech/contracts';
import { InvoiceDetail } from '@/components/admin/InvoiceDetail';
import { requirePermissionPage } from '@/lib/auth/session';
import { readInvoiceStorefrontUrl } from '@/lib/seo/queries';
import { readBrandConfig } from '@/lib/branding/queries';
import { readInvoiceDetail } from '@/lib/invoices/queries';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissionPage('reports.read');
  const { id } = await params;
  const [detail, brand, storefrontUrl, outletRows] = await Promise.all([
    readInvoiceDetail(id),
    readBrandConfig(),
    readInvoiceStorefrontUrl(),
    dbRead().select().from(outletConfig).where(isNull(outletConfig.deletedAt)).limit(1),
  ]);
  if (!detail) notFound();
  const row = outletRows[0];
  if (!row) notFound();
  const outlet: OutletConfig = {
    legalName: row.legalName,
    tradingName: row.tradingName,
    address: row.address,
    city: row.city,
    phone: row.phone,
    email: row.email ?? '',
    ntn: row.ntn,
    strn: row.strn,
    timezone: row.timezone,
    businessDayCutoff: row.businessDayCutoff,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    storeOpen: row.storeOpen,
    storeClose: row.storeClose,
    weeklyOffDays: row.weeklyOffDays ?? [],
  };
  return (
    <InvoiceDetail
      invoice={detail.invoice}
      order={detail.order}
      outlet={outlet}
      receipt={brand.receipt}
      storefrontUrl={storefrontUrl}
    />
  );
}
