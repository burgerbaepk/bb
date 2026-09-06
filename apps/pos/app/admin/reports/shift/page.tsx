import { requirePermissionPage } from '@/lib/auth/session';
import { readOutletTimezone } from '@/lib/outlet/queries';
import { readCurrentOrLastShift } from '@/lib/shifts/queries';
import { readShiftReport } from '@/lib/shifts/report';
import { ShiftReport } from '@/components/admin/reports/ShiftReport';

/**
 * Shift X and Z — BUILD-PLAN.md §12, §17, §6.13; docs/runfiles/M12-shifts.md.
 *
 * Shows the current shift live: the open one as an X report, or — once
 * nothing is open — the most recently closed one as a Z. Browsing further
 * back is a shift-history screen this milestone does not build (§2 Out);
 * that figure is emailed at close (`lib/shifts/report.ts`'s `sendZReportEmail`)
 * regardless.
 */
export default async function Page() {
  await requirePermissionPage('reports.read');

  const [shift, timezone] = await Promise.all([readCurrentOrLastShift(), readOutletTimezone()]);
  if (shift === null) {
    return (
      <div className="p-6">
        <p className="text-ink-muted text-sm">No shift has ever been opened.</p>
      </div>
    );
  }

  const report = await readShiftReport(shift);
  return <ShiftReport report={report} timezone={timezone} />;
}
