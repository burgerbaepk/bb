'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Save, UserCheck } from 'lucide-react';
import { Button, DataTable, TextField, cn } from '@natech/ui';
import { saveAttendanceAction, type AttendanceActionState } from '@/lib/attendance/actions';
import type { RegisterRow } from '@/lib/attendance/queries';
import {
  ATTENDANCE_STATUSES,
  STATUS_LABEL,
  STATUS_SHORT,
  STATUS_TONE,
  formatHours,
  markRestPresent,
  shiftDate,
  withStatus,
  workedMinutes,
  type DraftMark,
} from '@/lib/attendance/register';

const IDLE: AttendanceActionState = { error: null, message: null };
const CONTROL = 'border-border bg-surface min-h-touch w-full rounded-base border px-2';
const NAV =
  'border-border bg-surface inline-flex min-h-touch items-center gap-1 rounded-base border px-3 text-sm font-medium';

const now = () => {
  const at = new Date();
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
};

/**
 * The attendance book — ADR 0032, docs/runfiles/M26-attendance.md; made
 * quicker to fill in by M31.
 *
 * Still laid out like the paper register, one line per person, saved once.
 * What changed is how many touches a day takes. Each status is one tap
 * instead of a dropdown; Present fills in the person's usual times; "Everyone
 * else present" marks the rest in one go once the manager has tapped the one
 * absence; and "Now" stamps the clock for someone walking in. The boxes are
 * controlled so the counts and hours above them follow every tap.
 *
 * The posted field names are unchanged (`status:<id>`, `in:<id>`, …), so the
 * save action and its refusal rules are exactly M26's.
 */
export function AttendanceRegister({
  businessDate,
  today,
  rows,
  usual,
  canWrite,
}: {
  readonly businessDate: string;
  readonly today: string;
  readonly rows: readonly RegisterRow[];
  readonly usual: Readonly<Record<string, { timeIn: string; timeOut: string | null }>>;
  readonly canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(
    saveAttendanceAction.bind(null, businessDate),
    IDLE,
  );
  const editable = canWrite && businessDate <= today;
  const usualMap = new Map(Object.entries(usual));
  const [drafts, setDrafts] = useState<Map<string, DraftMark>>(
    () =>
      new Map(
        rows.map((row) => [
          row.employeeId,
          {
            status: row.status,
            timeIn: row.timeIn ?? '',
            timeOut: row.timeOut ?? '',
            note: row.note ?? '',
          },
        ]),
      ),
  );
  const draftOf = (id: string): DraftMark =>
    drafts.get(id) ?? { status: null, timeIn: '', timeOut: '', note: '' };
  const patch = (id: string, change: (draft: DraftMark) => DraftMark) =>
    setDrafts((current) => new Map(current).set(id, change(draftOf(id))));

  const all = [...drafts.values()];
  const unmarked = all.filter((draft) => draft.status === null).length;

  return (
    <div className="space-y-5">
      {/* A plain GET form and links: the date is in the URL, so a register
          can be linked to and the back button walks through days. */}
      <div className="flex flex-wrap items-end gap-3">
        <Link href={`?date=${shiftDate(businessDate, -1)}`} className={NAV}>
          <ChevronLeft aria-hidden="true" className="size-4" />
          Previous day
        </Link>
        {businessDate < today && (
          <Link href={`?date=${shiftDate(businessDate, 1)}`} className={NAV}>
            Next day
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
        )}
        {businessDate !== today && (
          <Link href="?" className={NAV}>
            Today
          </Link>
        )}
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
      </div>

      {/* `key` remounts the boxes when the day changes, so one day's marks
          never carry over onto the next. */}
      <form key={businessDate} action={action} className="space-y-3">
        {editable && rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              icon={UserCheck}
              disabled={unmarked === 0}
              onClick={() => setDrafts((current) => markRestPresent(current, usualMap))}
            >
              Everyone else present{unmarked > 0 ? ` (${unmarked})` : ''}
            </Button>
            <p className="text-ink-muted text-sm">
              Tap the absences first, then this marks the rest present with their usual times.
            </p>
          </div>
        )}
        <DataTable
          rows={rows}
          getRowId={(row) => row.employeeId}
          caption={`Attendance, ${businessDate}`}
          emptyTitle="Nobody on the register"
          emptyDescription="Add people under People › Employees."
          summary={() => (
            <span>
              {rows.length} people · {all.filter((d) => d.status === 'PRESENT').length} present ·{' '}
              {all.filter((d) => d.status === 'ABSENT').length} absent · {unmarked} not marked
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
              render: (row) => {
                const draft = draftOf(row.employeeId);
                if (!editable)
                  return draft.status === null ? 'Not marked' : STATUS_LABEL[draft.status];
                return (
                  <div
                    role="radiogroup"
                    aria-label={`Status for ${row.name}`}
                    className="flex flex-wrap gap-1"
                  >
                    <input
                      type="hidden"
                      name={`status:${row.employeeId}`}
                      value={draft.status ?? ''}
                    />
                    {ATTENDANCE_STATUSES.map((status) => {
                      const active = draft.status === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          aria-label={STATUS_LABEL[status]}
                          title={STATUS_LABEL[status]}
                          onClick={() =>
                            patch(row.employeeId, (d) =>
                              // A second tap on the chosen status clears it.
                              withStatus(d, active ? null : status, usualMap.get(row.employeeId)),
                            )
                          }
                          className={cn(
                            'min-h-touch min-w-11 rounded-base border px-2 text-sm font-semibold',
                            active
                              ? STATUS_TONE[status]
                              : 'border-border bg-surface text-ink-muted',
                          )}
                        >
                          {STATUS_SHORT[status]}
                        </button>
                      );
                    })}
                  </div>
                );
              },
            },
            ...(['in', 'out'] as const).map((which) => ({
              key: which,
              header: which === 'in' ? 'In' : 'Out',
              render: (row: RegisterRow) => {
                const draft = draftOf(row.employeeId);
                const value = which === 'in' ? draft.timeIn : draft.timeOut;
                if (!editable) return value === '' ? '—' : value;
                const present = draft.status === 'PRESENT';
                const set = (time: string) =>
                  patch(row.employeeId, (d) =>
                    which === 'in' ? { ...d, timeIn: time } : { ...d, timeOut: time },
                  );
                return (
                  <div className="flex gap-1">
                    <input
                      type="time"
                      name={`${which}:${row.employeeId}`}
                      value={value}
                      disabled={!present}
                      onChange={(event) => set(event.target.value)}
                      aria-label={`Time ${which} for ${row.name}`}
                      className={CONTROL}
                    />
                    {present && value === '' && businessDate === today && (
                      <Button
                        type="button"
                        size="sm"
                        tone="ghost"
                        icon={Clock}
                        aria-label={`Time ${which} now for ${row.name}`}
                        onClick={() => set(now())}
                      >
                        Now
                      </Button>
                    )}
                  </div>
                );
              },
            })),
            {
              key: 'hours',
              header: 'Hours',
              numeric: true,
              secondary: true,
              render: (row) => {
                const draft = draftOf(row.employeeId);
                const minutes = workedMinutes(
                  draft.timeIn === '' ? null : draft.timeIn,
                  draft.timeOut === '' ? null : draft.timeOut,
                );
                return minutes === null ? '—' : formatHours(minutes);
              },
            },
            {
              key: 'note',
              header: 'Note',
              secondary: true,
              render: (row) => {
                const draft = draftOf(row.employeeId);
                return editable ? (
                  <input
                    name={`note:${row.employeeId}`}
                    value={draft.note}
                    onChange={(event) =>
                      patch(row.employeeId, (d) => ({ ...d, note: event.target.value }))
                    }
                    maxLength={240}
                    aria-label={`Note for ${row.name}`}
                    className={CONTROL}
                  />
                ) : (
                  draft.note
                );
              },
            },
          ]}
        />
        {editable && rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" tone="primary" icon={Save} disabled={pending}>
              {pending ? 'Saving…' : 'Save register'}
            </Button>
            <p className="text-ink-muted text-sm">
              P present · A absent · L leave · Off day off. Tap again to clear. A time out earlier
              than the time in counts as the next morning.
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
    </div>
  );
}
