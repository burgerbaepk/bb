import { requirePermissionPage } from '@/lib/auth/session';
import { resolveReportRange } from '@/lib/reports/range';
import {
  readCategoryMix,
  readChannelMix,
  readItemSales,
  readPaymentMix,
  readSalesByDate,
} from '@/lib/reports/sales';
import { SalesReport } from '@/components/admin/reports/SalesReport';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermissionPage('reports.read');

  const params = await searchParams;
  const range = await resolveReportRange({
    from: typeof params['from'] === 'string' ? params['from'] : undefined,
    to: typeof params['to'] === 'string' ? params['to'] : undefined,
  });

  const [byDate, byItem, byCategory, byChannel, byPayment] = await Promise.all([
    readSalesByDate(range),
    readItemSales(range),
    readCategoryMix(range),
    readChannelMix(range),
    readPaymentMix(range),
  ]);

  return (
    <SalesReport
      range={range}
      byDate={byDate}
      byItem={byItem}
      byCategory={byCategory}
      byChannel={byChannel}
      byPayment={byPayment}
    />
  );
}
