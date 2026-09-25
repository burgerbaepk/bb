'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button, DataTable, Money, TextField } from '@natech/ui';
import { sum } from '@natech/domain';
import { recordAdvanceEntryAction, type AdvanceActionState } from '@/lib/advances/actions';
import { METHOD_LABEL, type AdvanceKind } from '@/lib/advances/balance';
import type { AdvanceEntryRow, AdvancePerson } from '@/lib/advances/queries';

const IDLE: AdvanceActionState = { error: null, message: null };
const SELECT = 'border-border bg-surface mt-1 min-h-touch w-full rounded-base border px-3';

/**
 * The staff advance book — ADR 0033, docs/runfiles/M27-staff-advances.md.
 *
 * There is no edit and no delete anywhere on this screen, deliberately. A
 * wrong entry is put right with a counter-entry, which keeps a till advance and
 * the drawer it came out of telling the same story.
 */
export function AdvanceLedger({
  people,
  entries,
  today,
  shiftOpen,
  canWrite,
}: {
  readonly people: readonly AdvancePerson[];
  readonly entries: readonly AdvanceEntryRow[];
  readonly today: string;
  readonly shiftOpen: boolean;
  readonly canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(recordAdvanceEntryAction, IDLE);
  const [kind, setKind] = useState<AdvanceKind>('ADVANCE');

  return (
    <div className="space-y-5">
      {canWrite && (
        <form action={action} className="border-border bg-surface-raised rounded-base border p-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">Record an entry</h2>
              <p className="text-ink-muted text-sm">
                An advance paid, or money recovered. Entries cannot be edited — correct a mistake
                with a counter-entry.
              </p>
            </div>
            <Button type="submit" tone="primary" icon={Plus} disabled={pending}>
              {pending ? 'Saving…' : 'Record'}
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="text-sm font-medium">
              Person
              <select name="employeeId" required className={SELECT} defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {people.map((person) => (
                  <option key={person.employeeId} value={person.employeeId}>
                    {person.name}
                    {person.isActive ? '' : ' (left)'}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              Entry
              <select
                name="kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as AdvanceKind)}
                className={SELECT}
              >
                <option value="ADVANCE">Advance paid</option>
                <option value="RECOVERY">Recovery</option>
              </select>
            </label>
            {kind === 'RECOVERY' && (
              <label className="text-sm font-medium">
                How it came back
                <select name="method" required className={SELECT}>
                  <option value="SALARY_DEDUCTION">{METHOD_LABEL.SALARY_DEDUCTION}</option>
                  <option value="CASH_RETURN">{METHOD_LABEL.CASH_RETURN}</option>
                </select>
              </label>
            )}
            <TextField
              name="amount"
              label="Amount (Rs.)"
              inputMode="decimal"
              placeholder="0.00"
              required
            />
            <TextField
              name="occurredOn"
              type="date"
              label="Date"
              defaultValue={today}
              max={today}
              required
            />
            <TextField name="note" label="Note" placeholder="Optional" maxLength={240} />
            <label className="flex items-start gap-2 text-sm md:col-span-2 xl:col-span-3">
              <input
                type="checkbox"
                name="fromTill"
                disabled={!shiftOpen}
                className="mt-1 size-4"
              />
              <span>
                <span className="font-medium">
                  {kind === 'ADVANCE' ? 'Paid from the till' : 'Paid back into the till'}
                </span>
                <span className="text-ink-muted block">
                  {shiftOpen
                    ? `Records a ${kind === 'ADVANCE' ? 'pay-out from' : 'pay-in to'} the open shift so the drawer still balances. Today only.`
                    : 'No shift is open, so nothing can go through the till.'}
                </span>
              </span>
            </label>
          </div>
          {state.error && (
            <p role="alert" className="text-danger mt-3 text-sm">
              {state.error}
            </p>
          )}
          {state.message && (
            <p role="status" className="text-ok mt-3 text-sm">
              {state.message}
            </p>
          )}
        </form>
      )}

      <DataTable
        rows={people}
        getRowId={(row) => row.employeeId}
        caption="Balances"
        emptyTitle="Nobody on the register"
        // R16 — the total is summed from the rows it heads.
        summary={(visible) => (
          <span>
            Owed to the restaurant:{' '}
            <Money
              value={sum(visible.map((row) => row.outstanding))}
              symbol="Rs."
              emphasis="strong"
            />
          </span>
        )}
        columns={[
          {
            key: 'name',
            header: 'Name',
            render: (row) => (row.isActive ? row.name : `${row.name} (left)`),
          },
          {
            key: 'advanced',
            header: 'Advanced',
            numeric: true,
            secondary: true,
            render: (row) => <Money value={row.advanced} />,
          },
          {
            key: 'recovered',
            header: 'Recovered',
            numeric: true,
            secondary: true,
            render: (row) => <Money value={row.recovered} />,
          },
          {
            key: 'outstanding',
            header: 'Outstanding',
            numeric: true,
            render: (row) => <Money value={row.outstanding} emphasis="strong" />,
          },
        ]}
      />

      <DataTable
        rows={entries}
        getRowId={(row) => row.id}
        caption="Entries, last ninety days"
        emptyTitle="No entries yet"
        columns={[
          { key: 'date', header: 'Date', render: (row) => row.occurredOn },
          { key: 'name', header: 'Name', render: (row) => row.name },
          {
            key: 'kind',
            header: 'Entry',
            render: (row) => (
              <div>
                <p>{row.kind === 'ADVANCE' ? 'Advance' : 'Recovery'}</p>
                <p className="text-ink-subtle text-xs">
                  {row.method === null ? '' : METHOD_LABEL[row.method]}
                  {row.throughTill ? `${row.method === null ? '' : ' · '}Through the till` : ''}
                </p>
              </div>
            ),
          },
          {
            key: 'note',
            header: 'Note',
            secondary: true,
            render: (row) => (
              <div>
                <p>{row.note ?? ''}</p>
                <p className="text-ink-subtle text-xs">{row.recordedBy ?? ''}</p>
              </div>
            ),
          },
          {
            key: 'amount',
            header: 'Amount',
            numeric: true,
            render: (row) => <Money value={row.amount} emphasis="strong" />,
          },
        ]}
      />
    </div>
  );
}
