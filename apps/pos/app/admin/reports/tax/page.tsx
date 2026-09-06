import { requirePermissionPage } from '@/lib/auth/session';
import { resolveReportRange } from '@/lib/reports/range';
import { readTaxLiability } from '@/lib/reports/tax';
import { TaxReport } from '@/components/admin/reports/TaxReport';

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

  const rows = await readTaxLiability(range);

  return <TaxReport range={range} rows={rows} />;
}
