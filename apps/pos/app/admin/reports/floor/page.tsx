import { requirePermissionPage } from '@/lib/auth/session';
import { resolveReportRange } from '@/lib/reports/range';
import { readCoversPerWaiter, readFloorPerformance } from '@/lib/reports/floor';
import { FloorReport } from '@/components/admin/reports/FloorReport';

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

  const [performance, coversPerWaiter] = await Promise.all([
    readFloorPerformance(range),
    readCoversPerWaiter(range),
  ]);

  return <FloorReport range={range} performance={performance} coversPerWaiter={coversPerWaiter} />;
}
