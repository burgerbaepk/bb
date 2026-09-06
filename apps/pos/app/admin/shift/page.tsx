import type { Metadata } from 'next';
import { ShiftScreen } from '@/components/shift/ShiftScreen';
import { requirePermissionPage } from '@/lib/auth/session';
import { readCurrentOrLastShift, readOutletHours } from '@/lib/shifts/queries';
import { readShiftReport } from '@/lib/shifts/report';

export const metadata: Metadata = {
  title: 'Shift management',
  robots: { index: false, follow: false },
};

/** Same-origin back-office register management; no legacy/external hand-off. */
export default async function Page() {
  await requirePermissionPage('shift.close');
  const [shift, schedule] = await Promise.all([readCurrentOrLastShift(), readOutletHours()]);
  const report = shift === null ? null : await readShiftReport(shift);

  return <ShiftScreen report={report} canManage timezone={schedule.timezone} schedule={schedule} />;
}
