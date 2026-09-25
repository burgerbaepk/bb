import { can } from '@natech/contracts';
import { AttendanceRegister } from '@/components/admin/AttendanceRegister';
import { PageHeading } from '@/components/admin/PageHeading';
import { requirePermissionPage } from '@/lib/auth/session';
import { readMonth, readRegister } from '@/lib/attendance/queries';
import { daysElapsed, monthBounds, summariseMonth } from '@/lib/attendance/register';
import { readCurrentBusinessDate } from '@/lib/outlet/queries';

/**
 * The attendance book — ADR 0032, docs/runfiles/M26-attendance.md.
 *
 * `reports.read` to read (so AUDITOR can, and changes nothing); the save needs
 * `expenses.write`, checked again in the action.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requirePermissionPage('reports.read');
  const today = await readCurrentBusinessDate();
  const requested = (await searchParams)['date'];
  const businessDate =
    typeof requested === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(requested) && requested <= today
      ? requested
      : today;

  const monthKey = businessDate.slice(0, 7);
  const [year = 0, mon = 0] = monthKey.split('-').map(Number);
  const { first, last } = monthBounds(monthKey);
  const [rows, month] = await Promise.all([readRegister(businessDate), readMonth(first, last)]);

  return (
    <>
      <PageHeading
        title="Attendance"
        note="The daily register for everyone who works here. It records who was in and when — it does not work out pay. Every change is kept in the activity log."
      />
      <AttendanceRegister
        businessDate={businessDate}
        today={today}
        rows={rows}
        month={summariseMonth(month.people, month.rows, daysElapsed(monthKey, today))}
        monthLabel={new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString('en-GB', {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        })}
        canWrite={can(viewer, 'expenses.write')}
      />
    </>
  );
}
