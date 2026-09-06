'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { CircleSlash, FileText, Lock, Plus, Trash2 } from 'lucide-react';
import { Button, DataTable, StatusPill, TextField, type PillTone } from '@natech/ui';
import type { DemandSheetStatus } from '@natech/domain';
import {
  createDemandSheetAction,
  deleteDemandSheetAction,
  type DemandActionState,
} from '@/lib/demand/actions';
import type { DemandSheetRow } from '@/lib/demand/queries';

const IDLE: DemandActionState = { error: null, message: null };

/**
 * The status pill — ADR 0026.
 *
 * DRAFT is `warn` rather than `neutral` on purpose: an unsubmitted sheet on
 * the day the goods are wanted is the failure this module exists to prevent,
 * and it should not look the same as a settled one.
 */
const STATUS: Record<DemandSheetStatus, { label: string; tone: PillTone; icon: typeof FileText }> =
  {
    DRAFT: { label: 'Draft', tone: 'warn', icon: FileText },
    SUBMITTED: { label: 'Submitted', tone: 'ok', icon: Lock },
    CANCELLED: { label: 'Cancelled', tone: 'neutral', icon: CircleSlash },
  };

export function DemandSheetList({
  rows,
  today,
  canWrite,
}: {
  readonly rows: readonly DemandSheetRow[];
  readonly today: string;
  readonly canWrite: boolean;
}) {
  const [state, action, pending] = useActionState(createDemandSheetAction, IDLE);
  return (
    <div className="space-y-5">
      {canWrite && (
        <form action={action} className="border-border bg-surface-raised rounded-base border p-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">Start a demand sheet</h2>
              <p className="text-ink-muted text-sm">
                What the kitchen needs bought, and when it is needed by. Add the items on the next
                screen, then submit it — a submitted sheet cannot be edited.
              </p>
            </div>
            <Button type="submit" tone="primary" icon={Plus} disabled={pending}>
              {pending ? 'Starting…' : 'Start sheet'}
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <TextField
              name="neededBy"
              type="date"
              label="Needed by"
              help="The day the goods must be here, not today's date."
              defaultValue={today}
              required
            />
            <TextField
              name="supplier"
              label="Supplier"
              placeholder="Optional"
              help="Enter the supplier name, if known."
            />
            <label className="text-sm font-medium">
              Note
              <textarea
                name="note"
                rows={2}
                placeholder="Optional — anything the buyer needs to know."
                className="border-border bg-surface mt-1 w-full rounded-base border px-3 py-2"
              />
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
        rows={rows}
        getRowId={(row) => row.id}
        caption="Demand sheets"
        summary={(visible) => (
          <span>
            {visible.length} sheets · {visible.filter((row) => row.status === 'DRAFT').length} still
            in draft
          </span>
        )}
        columns={[
          { key: 'neededBy', header: 'Needed by', render: (row) => row.neededBy },
          {
            key: 'status',
            header: 'Status',
            render: (row) => {
              const preset = STATUS[row.status];
              return (
                <StatusPill label={preset.label} tone={preset.tone} icon={preset.icon} size="sm" />
              );
            },
          },
          {
            key: 'supplier',
            header: 'Supplier',
            render: (row) => (
              <div>
                <p>{row.supplier ?? 'Not stated'}</p>
                {row.note !== null && <p className="text-ink-subtle text-xs">{row.note}</p>}
              </div>
            ),
          },
          {
            key: 'createdBy',
            header: 'Raised by',
            secondary: true,
            render: (row) => row.createdBy ?? '—',
          },
          {
            key: 'open',
            header: '',
            render: (row) => (
              <div className="flex justify-end gap-2">
                <Link
                  className="text-primary font-semibold underline-offset-2 hover:underline"
                  href={`/admin/demand/${row.id}`}
                >
                  Open
                </Link>
                {canWrite && row.status === 'DRAFT' && (
                  <form action={() => deleteDemandSheetAction(row.id)}>
                    <Button type="submit" size="sm" tone="ghost" icon={Trash2}>
                      Discard
                    </Button>
                  </form>
                )}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
