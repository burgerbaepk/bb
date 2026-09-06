import { requirePermissionPage } from '@/lib/auth/session';
import { readOutletTimezone } from '@/lib/outlet/queries';
import { resolveReportRange } from '@/lib/reports/range';
import { readAuditorPack } from '@/lib/reports/auditorPack';
import { AuditorPackReport } from '@/components/admin/reports/AuditorPackReport';

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

  const [pack, timezone] = await Promise.all([readAuditorPack(range), readOutletTimezone()]);

  return <AuditorPackReport pack={pack} timezone={timezone} />;
}
