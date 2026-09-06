import { InvoiceRegister } from '@/components/admin/InvoiceRegister';
import { requirePermissionPage } from '@/lib/auth/session';
import { listInvoices } from '@/lib/invoices/queries';
import { readOutletTimezone } from '@/lib/outlet/queries';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermissionPage('reports.read');
  const params = await searchParams;
  const filters = {
    query: typeof params['q'] === 'string' ? params['q'] : '',
    from: typeof params['from'] === 'string' ? params['from'] : '',
    to: typeof params['to'] === 'string' ? params['to'] : '',
    shiftId: typeof params['shiftId'] === 'string' ? params['shiftId'] : '',
  };
  const [rows, timezone] = await Promise.all([listInvoices(filters), readOutletTimezone()]);
  return <InvoiceRegister rows={rows} timezone={timezone} filters={filters} />;
}
