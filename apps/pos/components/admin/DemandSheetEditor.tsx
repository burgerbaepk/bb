'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { ArrowLeft, CircleSlash, FileText, Lock, Plus, Printer, Trash2 } from 'lucide-react';
import { Button, DataTable, Money, StatusPill, TextField, type PillTone } from '@natech/ui';
import { qtyToString, type DemandSheetStatus } from '@natech/domain';
import {
  addDemandLineAction,
  cancelDemandSheetAction,
  deleteDemandLineAction,
  submitDemandSheetAction,
  type DemandActionState,
} from '@/lib/demand/actions';
import type { DemandCatalogueGroup, DemandSheetDetail } from '@/lib/demand/queries';
import { sheetEstimate, unpricedLines } from '@/lib/demand/total';
import { DemandSheetGrid } from './DemandSheetGrid';

const IDLE: DemandActionState = { error: null, message: null };

const STATUS: Record<DemandSheetStatus, { label: string; tone: PillTone; icon: typeof FileText }> =
  {
    DRAFT: { label: 'Draft', tone: 'warn', icon: FileText },
    SUBMITTED: { label: 'Submitted', tone: 'ok', icon: Lock },
    CANCELLED: { label: 'Cancelled', tone: 'neutral', icon: CircleSlash },
  };

export function DemandSheetEditor({
  sheet,
  catalogue,
  canWrite,
}: {
  readonly sheet: DemandSheetDetail;
  readonly catalogue: readonly DemandCatalogueGroup[];
  readonly canWrite: boolean;
}) {
  const editable = canWrite && sheet.status === 'DRAFT';
  const [lineState, addLine, addingLine] = useActionState(
    addDemandLineAction.bind(null, sheet.id),
    IDLE,
  );
  const [submitState, submit, submitting] = useActionState(
    submitDemandSheetAction.bind(null, sheet.id),
    IDLE,
  );
  const [cancelState, cancel, cancelling] = useActionState(
    cancelDemandSheetAction.bind(null, sheet.id),
    IDLE,
  );
  const preset = STATUS[sheet.status];
  const estimate = sheetEstimate(sheet.lines);
  const unpriced = unpricedLines(sheet.lines);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-4">
        <Link
          className="border-border rounded-base border p-2"
          href="/admin/demand"
          aria-label="Back to demand sheets"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Needed by {sheet.neededBy}</h1>
            <StatusPill label={preset.label} tone={preset.tone} icon={preset.icon} size="sm" />
          </div>
          <p className="text-ink-muted mt-1 text-sm">
            {sheet.supplier ?? 'No supplier stated'}
            {sheet.createdBy !== null && ` · raised by ${sheet.createdBy}`}
            {sheet.note !== null && ` · ${sheet.note}`}
          </p>
          {sheet.status === 'CANCELLED' && (
            <p className="text-ink-muted mt-1 text-sm">
              Cancelled{sheet.cancelReason !== null && `: ${sheet.cancelReason}`}. Write a fresh
              sheet rather than editing this one.
            </p>
          )}
        </div>
        {/* A demand sheet is an A4 document for a supplier, not an 80mm receipt
            for a guest, so it goes through the browser rather than the ESC/POS
            bridge — runfile §2. */}
        <Button type="button" tone="ghost" icon={Printer} onClick={() => window.print()}>
          Print
        </Button>
      </div>

      {editable && catalogue.length > 0 && (
        <DemandSheetGrid sheetId={sheet.id} groups={catalogue} />
      )}

      {editable && (
        <form action={addLine} className="border-border bg-surface-raised rounded-base border p-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              {/* The paper form has blank rows at the bottom of each column for
                  exactly this. The list covers the ordinary week; this covers
                  the light bulb that went in the skip. */}
              <h2 className="font-semibold">Something not on the list</h2>
              <p className="text-ink-muted text-sm">
                Quantities take up to three decimals, so 0.25 kg is exact. The unit and the cost are
                both optional — leave the cost blank if you do not know today&rsquo;s price.
              </p>
            </div>
            <Button type="submit" tone="primary" icon={Plus} disabled={addingLine}>
              {addingLine ? 'Adding…' : 'Add item'}
            </Button>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <TextField
              name="item"
              label="Item"
              placeholder="Chicken, boneless"
              className="xl:col-span-2"
              required
            />
            <TextField name="unit" label="Unit" placeholder="kg" />
            <TextField
              name="qty"
              label="Quantity"
              inputMode="decimal"
              placeholder="20"
              tabular
              required
            />
            <TextField
              name="estimatedUnitCost"
              label="Est. cost per unit (Rs.)"
              inputMode="decimal"
              placeholder="Optional"
              tabular
            />
            <TextField
              name="note"
              label="Note"
              placeholder="Optional — grade, brand, cut."
              className="md:col-span-2 xl:col-span-5"
            />
          </div>
          {lineState.error && (
            <p role="alert" className="text-danger mt-3 text-sm">
              {lineState.error}
            </p>
          )}
          {lineState.message && (
            <p role="status" className="text-ok mt-3 text-sm">
              {lineState.message}
            </p>
          )}
        </form>
      )}

      <DataTable
        rows={sheet.lines}
        getRowId={(row) => row.id}
        caption="Items requested"
        summary={() => (
          <span>
            {sheet.lines.length} items · <Money value={estimate} symbol="Rs." emphasis="strong" />{' '}
            estimated
            {/* R16 — the total is a function of the rows it summarises, and it
                cannot summarise a line with no price. Saying so is the whole
                difference between an estimate and a wrong total. */}
            {unpriced > 0 && (
              <span className="text-ink-subtle">
                {' '}
                · {unpriced} {unpriced === 1 ? 'item has' : 'items have'} no price and{' '}
                {unpriced === 1 ? 'is' : 'are'} not in that figure
              </span>
            )}
          </span>
        )}
        columns={[
          {
            key: 'item',
            header: 'Item',
            render: (row) => (
              <div>
                <p>{row.item}</p>
                {(row.category !== null || row.note !== null) && (
                  <p className="text-ink-subtle text-xs">
                    {[row.category, row.note].filter((part) => part !== null).join(' · ')}
                  </p>
                )}
              </div>
            ),
          },
          {
            key: 'qty',
            header: 'Quantity',
            numeric: true,
            // The unit is appended only when there is one; "20 null" on a
            // printed sheet handed to a supplier would be worse than "20".
            render: (row) =>
              row.unit === null ? qtyToString(row.qty) : `${qtyToString(row.qty)} ${row.unit}`,
          },
          {
            key: 'unitCost',
            header: 'Est. per unit',
            numeric: true,
            secondary: true,
            render: (row) =>
              row.estimatedUnitCost === null ? (
                <span className="text-ink-subtle">Not priced</span>
              ) : (
                <Money value={row.estimatedUnitCost} />
              ),
          },
          {
            key: 'actions',
            header: '',
            render: (row) =>
              editable ? (
                <form action={() => deleteDemandLineAction(sheet.id, row.id)}>
                  <Button type="submit" size="sm" tone="ghost" icon={Trash2}>
                    Remove
                  </Button>
                </form>
              ) : null,
          },
        ]}
      />

      {canWrite && sheet.status !== 'CANCELLED' && (
        <div className="border-border bg-surface-raised rounded-base grid gap-4 border p-4 md:grid-cols-2">
          {sheet.status === 'DRAFT' && (
            <form action={submit}>
              <h2 className="font-semibold">Submit</h2>
              <p className="text-ink-muted mt-1 mb-3 text-sm">
                Hand this sheet over. It is frozen once submitted — a sheet that turns out to be
                wrong is cancelled and rewritten, so the record shows both.
              </p>
              <Button type="submit" tone="primary" icon={Lock} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit sheet'}
              </Button>
              {submitState.error && (
                <p role="alert" className="text-danger mt-3 text-sm">
                  {submitState.error}
                </p>
              )}
            </form>
          )}
          <form action={cancel}>
            <h2 className="font-semibold">Cancel</h2>
            <p className="text-ink-muted mt-1 mb-3 text-sm">
              The sheet stays on the record, marked cancelled.
            </p>
            <TextField name="cancelReason" label="Reason" placeholder="Optional" />
            <Button
              type="submit"
              tone="ghost"
              icon={CircleSlash}
              className="mt-3"
              disabled={cancelling}
            >
              {cancelling ? 'Cancelling…' : 'Cancel sheet'}
            </Button>
            {cancelState.error && (
              <p role="alert" className="text-danger mt-3 text-sm">
                {cancelState.error}
              </p>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
