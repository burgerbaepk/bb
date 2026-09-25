'use client';

import { useActionState } from 'react';
import { CalendarDays, Save } from 'lucide-react';
import { Button, DataTable, TextField } from '@natech/ui';
import { saveAttendanceAction, type AttendanceActionState } from '@/lib/attendance/actions';
import type { RegisterRow } from '@/lib/attendance/queries';
import {
  ATTENDANCE_STATUSES,
  STATUS_LABEL,
  formatHours,
  workedMinutes,
  type MonthSummary,
} from '@/lib/attendance/register';

const IDLE: AttendanceActionState = { error: null, message: null };
const CONTROL = 'border-border bg-surface min-h-touch w-full rounded-base border px-2';

/**
 * The attendance book — ADR 0032, docs/runfiles/M26-attendance.md.
 *
 * Laid out like the paper register: one line per person, the manager walks
 * down it and saves once. Inputs are uncontrolled and keyed by employee id, so
 * the action reads exactly the boxes that were on screen and nothing else.
 */
export function AttendanceRegister({
  businessDate,
  today,
  rows,
  month,
  monthLabel,
  canWrite,
}: {
  readonly businessDate: string;
  readonly today: string;
  readonly rows: readonly RegisterRow[];
  readonly month: readonly MonthSummary[];
  readonly monthLabel: string;
  readonly canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(
    saveAttendanceAction.bind(null, businessDate),
    IDLE,
  );
  const editable = canWrite && businessDate <= today;

  return (
    <div className="space-y-5">
      {/* A plain GET form: the date is in the URL, so a register can be linked
          to and the back button walks through days. */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <TextField
          name="date"
          type="date"
          label="Register for"
          defaultValue={businessDate}
          max={today}
        />
        <Button type="submit" tone="secondary" icon={CalendarDays}>
          Open day
        </Button>
      </form>

      {/* `key` remounts the uncontrolled inputs when the day changes, so one
          day's boxes never carry over onto the next. */}
      <form key={businessDate} action={action} className="space-y-3">
        <DataTable
          rows={rows}
          getRowId={(row) => row.employeeId}
          caption={`Attendance, ${businessDate}`}
          emptyTitle="Nobody on the register"
          emptyDescription="The owner adds people under People › Employees."
          summary={(visible) => (
            <span>
              {visible.length} people · {visible.filter((row) => row.status === 'PRESENT').length}{' '}
              present · {visible.filter((row) => row.status === null).length} not marked
            </span>
          )}
          columns={[
            {
              key: 'name',
              header: 'Name',
              render: (row) => (
                <div>
                  <p className="font-medium">{row.name}</p>
                  {row.jobTitle !== null && (
                    <p className="text-ink-subtle text-xs">{row.jobTitle}</p>
                  )}
                </div>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (row) =>
                editable ? (
                  <select
                    name={`status:${row.employeeId}`}
                    defaultValue={row.status ?? ''}
                    aria-label={`Status for ${row.name}`}
                    className={CONTROL}
                  >
                    <option value="">Not marked</option>
                    {ATTENDANCE_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {STATUS_LABEL[status]}
                      </option>
                    ))}
                  </select>
                ) : row.status === null ? (
                  'Not marked'
                ) : (
                  STATUS_LABEL[row.status]
                ),
            },
            {
              key: 'in',
              header: 'In',
              render: (row) =>
                editable ? (
                  <input
                    type="time"
                    name={`in:${row.employeeId}`}
                    defaultValue={row.timeIn ?? ''}
                    aria-label={`Time in for ${row.name}`}
                    className={CONTROL}
                  />
                ) : (
                  (row.timeIn ?? '—')
                ),
            },
            {
              key: 'out',
              header: 'Out',
              render: (row) =>
                editable ? (
                  <input
                    type="time"
                    name={`out:${row.employeeId}`}
                    defaultValue={row.timeOut ?? ''}
                    aria-label={`Time out for ${row.name}`}
                    className={CONTROL}
                  />
                ) : (
                  (row.timeOut ?? '—')
                ),
            },
            {
              key: 'hours',
              header: 'Hours',
              numeric: true,
              secondary: true,
              render: (row) => {
                const minutes = workedMinutes(row.timeIn, row.timeOut);
                return minutes === null ? '—' : formatHours(minutes);
              },
            },
            {
              key: 'note',
              header: 'Note',
              secondary: true,
              render: (row) =>
                editable ? (
                  <input
                    name={`note:${row.employeeId}`}
                    defaultValue={row.note ?? ''}
                    maxLength={240}
                    aria-label={`Note for ${row.name}`}
                    className={CONTROL}
                  />
                ) : (
                  (row.note ?? '')
                ),
            },
          ]}
        />
        {editable && rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" tone="primary" icon={Save} disabled={pending}>
              {pending ? 'Saving…' : 'Save register'}
            </Button>
            <p className="text-ink-muted text-sm">
              A time out earlier than the time in counts as the next morning.
            </p>
          </div>
        )}
        {state.error && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
        {state.message && (
          <p role="status" className="text-ok text-sm">
            {state.message}
          </p>
        )}
      </form>

      <DataTable
        rows={month}
        getRowId={(row) => row.employeeId}
        caption={`${monthLabel} so far`}
        emptyTitle="No attendance this month"
        columns={[
          { key: 'name', header: 'Name', render: (row) => row.name },
          ...ATTENDANCE_STATUSES.map((status) => ({
            key: status,
            header: STATUS_LABEL[status],
            numeric: true,
            render: (row: MonthSummary) => row.counts[status],
          })),
          {
            key: 'unmarked',
            header: 'Not marked',
            numeric: true,
            render: (row) => row.unmarked,
          },
          {
            key: 'hours',
            header: 'Hours',
            numeric: true,
            secondary: true,
            render: (row) => formatHours(row.minutes),
          },
        ]}
      />
    </div>
  );
}
