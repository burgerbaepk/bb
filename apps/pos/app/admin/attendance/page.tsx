import { can } from '@natech/contracts';
import { AttendanceMonthGrid } from '@/components/admin/AttendanceMonthGrid';
import { AttendanceRegister } from '@/components/admin/AttendanceRegister';
import { PageHeading } from '@/components/admin/PageHeading';
import { requirePermissionPage } from '@/lib/auth/session';
import { readMonth, readRegister, readUsualTimes } from '@/lib/attendance/queries';
import { daysElapsed, monthBounds, shiftDate, summariseMonth } from '@/lib/attendance/register';
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
  const [rows, month, usual] = await Promise.all([
    readRegister(businessDate),
    readMonth(first, last),
    readUsualTimes(businessDate),
  ]);
  const days: string[] = [];
  for (let day = first; day <= last; day = shiftDate(day, 1)) days.push(day);

  return (
    <>
      <PageHeading
        title="Attendance"
        note="The daily register for everyone who works here. It records who was in and when — it does not work out pay. Every change is kept in the activity log."
      />
      <div className="print-document space-y-5">
        <AttendanceRegister
          // A new day is a new set of boxes; never carry taps across days.
          key={businessDate}
          businessDate={businessDate}
          today={today}
          rows={rows}
          usual={Object.fromEntries(usual)}
          canWrite={can(viewer, 'expenses.write')}
        />
        <AttendanceMonthGrid
          monthLabel={`${new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString('en-GB', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          })} so far`}
          days={days}
          summary={summariseMonth(month.people, month.rows, daysElapsed(monthKey, today))}
          marks={month.rows}
          businessDate={businessDate}
        />
      </div>
    </>
  );
}
