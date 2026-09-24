import { ActivityLog } from '@/components/admin/ActivityLog';
import { requirePermissionPage } from '@/lib/auth/session';
import { listActivity, listActors } from '@/lib/activity/queries';
import { readOutletTimezone } from '@/lib/outlet/queries';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // ADR 0030 — owners (and an auditor), not managers.
  await requirePermissionPage('audit.read');
  const params = await searchParams;
  const text = (key: string): string =>
    typeof params[key] === 'string' ? (params[key] as string) : '';
  const filters = {
    actorId: text('actorId'),
    role: text('role'),
    action: text('action'),
    from: text('from'),
    to: text('to'),
  };

  const [rows, actors, timezone] = await Promise.all([
    listActivity(filters),
    listActors(),
    readOutletTimezone(),
  ]);

  return <ActivityLog rows={rows} actors={actors} timezone={timezone} filters={filters} />;
}
