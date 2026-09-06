import type { Metadata } from 'next';
import { can } from '@natech/contracts';
import { currentTillIdentity } from '@/lib/auth/session';
import { readCurrentOrLastShift, readOutletHours } from '@/lib/shifts/queries';
import { readShiftReport } from '@/lib/shifts/report';
import { ShiftScreen } from '@/components/shift/ShiftScreen';

/**
 * The till's shift screen — BUILD-PLAN.md §5.9, §12; docs/runfiles/M12-shifts.md.
 */
export const metadata: Metadata = {
  title: 'Shift',
  robots: { index: false, follow: false },
};

export default async function Page() {
  const identity = await currentTillIdentity();
  if (identity === null) return null;
  const { viewer } = identity;
  const [shift, schedule] = await Promise.all([readCurrentOrLastShift(), readOutletHours()]);
  const report = shift === null ? null : await readShiftReport(shift);

  return (
    <ShiftScreen
      report={report}
      canManage={can(viewer, 'shift.close')}
      timezone={schedule.timezone}
      schedule={schedule}
    />
  );
}
