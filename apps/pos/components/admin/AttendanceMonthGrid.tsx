import { cn } from '@natech/ui';
import {
  ATTENDANCE_STATUSES,
  STATUS_LABEL,
  STATUS_SHORT,
  STATUS_TONE,
  formatHours,
  type AttendanceStatus,
  type MonthSummary,
} from '@/lib/attendance/register';

/**
 * The month as the paper register shows it — M31. One row per person, one
 * column per day, a letter in each marked cell, and the month's counts at the
 * end of the row. The counts come from `summariseMonth` over the same rows the
 * cells are drawn from (R16), so a row cannot show five P's and count four.
 *
 * A server component, and printable: the page is a `print-document`, so the
 * owner can print the month for whoever settles salaries.
 */
export function AttendanceMonthGrid({
  monthLabel,
  days,
  summary,
  marks,
  businessDate,
}: {
  readonly monthLabel: string;
  /** Every date of the month, `YYYY-MM-DD`. */
  readonly days: readonly string[];
  readonly summary: readonly MonthSummary[];
  readonly marks: readonly { employeeId: string; businessDate: string; status: AttendanceStatus }[];
  /** The day open on the register above, outlined in the grid. */
  readonly businessDate: string;
}) {
  const byCell = new Map(
    marks.map((mark) => [`${mark.employeeId}:${mark.businessDate}`, mark.status]),
  );
  return (
    <section className="border-border overflow-x-auto rounded-base border">
      <h2 className="bg-surface-sunken px-3 py-2 text-sm font-semibold">{monthLabel}</h2>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-ink-muted">
            <th className="bg-surface sticky start-0 px-3 py-1.5 text-start font-medium">Name</th>
            {days.map((day) => (
              <th
                key={day}
                className={cn(
                  'w-7 px-0.5 py-1.5 text-center font-medium tabular-nums',
                  day === businessDate && 'text-ink',
                )}
              >
                <a href={`?date=${day}`}>{Number(day.slice(8))}</a>
              </th>
            ))}
            {ATTENDANCE_STATUSES.map((status) => (
              <th
                key={status}
                className="px-1.5 py-1.5 text-end font-medium"
                title={STATUS_LABEL[status]}
              >
                {STATUS_SHORT[status]}
              </th>
            ))}
            <th className="px-1.5 py-1.5 text-end font-medium">Not marked</th>
            <th className="px-3 py-1.5 text-end font-medium">Hours</th>
          </tr>
        </thead>
        <tbody>
          {summary.map((person) => (
            <tr key={person.employeeId} className="border-border border-t">
              <td className="bg-surface sticky start-0 px-3 py-1.5 font-medium whitespace-nowrap">
                {person.name}
              </td>
              {days.map((day) => {
                const status = byCell.get(`${person.employeeId}:${day}`);
                return (
                  <td key={day} className="px-0.5 py-1 text-center">
                    {status === undefined ? (
                      <span className="text-ink-subtle">·</span>
                    ) : (
                      <span
                        title={`${STATUS_LABEL[status]}, ${day}`}
                        className={cn(
                          'inline-block min-w-6 rounded-sm border px-0.5 font-semibold',
                          STATUS_TONE[status],
                          day === businessDate && 'ring-ink ring-1',
                        )}
                      >
                        {STATUS_SHORT[status]}
                      </span>
                    )}
                  </td>
                );
              })}
              {ATTENDANCE_STATUSES.map((status) => (
                <td key={status} className="px-1.5 py-1.5 text-end tabular-nums">
                  {person.counts[status]}
                </td>
              ))}
              <td className="px-1.5 py-1.5 text-end tabular-nums">{person.unmarked}</td>
              <td className="px-3 py-1.5 text-end tabular-nums">{formatHours(person.minutes)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
