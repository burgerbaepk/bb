import { requirePermissionPage } from '@/lib/auth/session';
import { readOutletTimezone } from '@/lib/outlet/queries';
import { resolveReportRange } from '@/lib/reports/range';
import { readExceptions } from '@/lib/reports/exceptions';
import { ExceptionsReport } from '@/components/admin/reports/ExceptionsReport';

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

  const [exceptions, timezone] = await Promise.all([readExceptions(range), readOutletTimezone()]);

  return <ExceptionsReport range={range} timezone={timezone} exceptions={exceptions} />;
}
