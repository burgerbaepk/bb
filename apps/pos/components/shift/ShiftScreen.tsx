'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownToLine, ArrowUpFromLine, Clock3, Lock, LockOpen, Vault } from 'lucide-react';
import { Button, DataTable, Money, StatCard, StatusPill, useToast } from '@natech/ui';
import type { Paisa } from '@natech/domain';
import { toPaisaWire, type CashMovementType, type ShiftReport } from '@natech/contracts';
import { closeShiftAction, openShiftAction, recordCashMovementAction } from '@/lib/shifts/actions';
import { useOptionalOffline } from '@/lib/offline/OfflineProvider';
import { formatDateTime } from '@/components/lib/format';
import { OpenShiftDialog } from './OpenShiftDialog';
import { CashMovementDialog } from './CashMovementDialog';
import { CloseShiftDialog } from './CloseShiftDialog';
import type { OutletHours } from '@/lib/shifts/queries';

/**
 * The till's shift screen — BUILD-PLAN.md §5.9, §12; docs/runfiles/M12-shifts.md.
 *
 * `report` is the same `readShiftReport` output the admin X/Z page renders —
 * this screen shows a till-appropriate subset of it (no per-cashier or
 * payment-mix breakdown; that is back-office reading, `/admin/reports/shift`).
 * `canManage` hides the action buttons for staff without `shift.close`; the
 * server actions re-check regardless (§14.1 — client-side hiding is cosmetic).
 */
export interface ShiftScreenProps {
  readonly report: ShiftReport | null;
  readonly canManage: boolean;
  readonly timezone: string;
  readonly schedule: OutletHours;
}

const MOVEMENT_ICONS = { PAY_IN: ArrowDownToLine, PAY_OUT: ArrowUpFromLine, DROP: Vault } as const;

export function ShiftScreen({ report, canManage, timezone, schedule }: ShiftScreenProps) {
  const router = useRouter();
  const toast = useToast();
  const isOffline = useOptionalOffline()?.isOffline ?? false;

  const [openDialogOpen, setOpenDialogOpen] = useState(false);
  const [openPending, setOpenPending] = useState(false);

  const [movementType, setMovementType] = useState<CashMovementType | null>(null);
  const [movementPending, setMovementPending] = useState(false);
  const [movementError, setMovementError] = useState<string | null>(null);

  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [closePending, setClosePending] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  const isOpen = report !== null && report.kind === 'X';

  const handleCloseShift = async (countedCash: Paisa, notes: string) => {
    if (report === null) return;
    setClosePending(true);
    setCloseError(null);
    try {
      const result = await closeShiftAction({
        shiftId: report.shiftId,
        countedCash: toPaisaWire(countedCash),
        notes,
      });
      if (!result.ok) {
        setCloseError(result.error ?? 'Could not close the shift.');
        return;
      }

      toast.show('success', 'Shift closed.');
      setCloseDialogOpen(false);
      router.refresh();
    } catch (error) {
      setCloseError(error instanceof Error ? error.message : 'Could not close the shift.');
    } finally {
      setClosePending(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Shift</h1>
        <StatusPill
          icon={isOpen ? LockOpen : Lock}
          tone={isOpen ? 'ok' : 'neutral'}
          label={isOpen ? 'Open' : 'Closed'}
        />
      </div>

      <section className="border-border bg-surface-raised rounded-base border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">System schedule</h2>
            <p className="text-ink-muted text-sm">
              Automatic by default. A manual close is respected until the next opening window.
            </p>
          </div>
          <StatusPill
            icon={Clock3}
            tone={schedule.storeOpen !== null && schedule.storeClose !== null ? 'ok' : 'warn'}
            label={
              schedule.storeOpen !== null && schedule.storeClose !== null
                ? 'Automation enabled'
                : 'Schedule incomplete'
            }
          />
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <ScheduleValue label="Auto start" value={formatClock(schedule.storeOpen)} />
          <ScheduleValue label="Auto close" value={formatClock(schedule.storeClose)} />
          <ScheduleValue
            label="Manual override"
            value={canManage ? 'Available' : 'Manager permission required'}
          />
        </dl>
      </section>

      {report === null ? (
        <p className="text-ink-muted text-sm">No shift has ever been opened.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard
            label="Opened"
            value={formatDateTime(report.openedAt, timezone)}
            caption={`by ${report.openedByName}`}
          />
          <StatCard
            label="Cash expected"
            value={<Money value={report.expectedCash} symbol="Rs." />}
            caption={
              <>
                float <Money value={report.openingFloat} symbol="Rs." />
              </>
            }
          />
          <StatCard label="Invoices" value={report.invoiceCount} />
          <StatCard
            label="Net sales"
            value={<Money value={report.netSales} symbol="Rs." />}
            caption={
              <>
                tax <Money value={report.taxCollected} symbol="Rs." />
              </>
            }
          />
        </div>
      )}

      {canManage && (
        <div className="flex flex-wrap gap-2">
          {!isOpen && (
            <Button tone="primary" onClick={() => setOpenDialogOpen(true)}>
              Open shift
            </Button>
          )}
          {isOpen && (
            <>
              <Button
                icon={ArrowDownToLine}
                onClick={() => {
                  setMovementError(null);
                  setMovementType('PAY_IN');
                }}
              >
                Pay in
              </Button>
              <Button
                icon={ArrowUpFromLine}
                onClick={() => {
                  setMovementError(null);
                  setMovementType('PAY_OUT');
                }}
              >
                Pay out
              </Button>
              <Button
                icon={Vault}
                onClick={() => {
                  setMovementError(null);
                  setMovementType('DROP');
                }}
              >
                Drop
              </Button>
              <Button
                tone="danger"
                disabled={isOffline}
                title={
                  isOffline
                    ? 'Connect this till to the internet before closing the shift.'
                    : undefined
                }
                onClick={() => {
                  if (isOffline) {
                    toast.show('error', 'Shift close is blocked while this terminal is offline.');
                    return;
                  }
                  setCloseError(null);
                  setCloseDialogOpen(true);
                }}
              >
                Close shift
              </Button>
            </>
          )}
        </div>
      )}

      {report !== null && (
        <DataTable
          rows={report.cashMovements}
          getRowId={(row) => row.id}
          caption="Cash movements this shift"
          emptyTitle="No pay-ins, pay-outs, or drops yet"
          columns={[
            {
              key: 'type',
              header: 'Type',
              render: (row) => (
                <StatusPill
                  size="sm"
                  tone={row.type === 'PAY_IN' ? 'ok' : 'neutral'}
                  icon={MOVEMENT_ICONS[row.type]}
                  label={row.type.replace('_', ' ').toLowerCase()}
                />
              ),
            },
            { key: 'reason', header: 'Reason', render: (row) => row.reason },
            { key: 'actor', header: 'Who', secondary: true, render: (row) => row.actorName },
            {
              key: 'amount',
              header: 'Amount',
              numeric: true,
              render: (row) => <Money value={row.amount} />,
            },
          ]}
        />
      )}

      <OpenShiftDialog
        open={openDialogOpen}
        pending={openPending}
        onClose={() => setOpenDialogOpen(false)}
        onConfirm={(openingFloat: Paisa) => {
          setOpenPending(true);
          void openShiftAction({ openingFloat: toPaisaWire(openingFloat) }).then((result) => {
            setOpenPending(false);
            if (result.ok) {
              toast.show('success', 'Shift opened');
              setOpenDialogOpen(false);
              router.refresh();
            } else {
              toast.show('error', result.error ?? 'Could not open the shift.');
            }
          });
        }}
      />

      <CashMovementDialog
        type={movementType}
        pending={movementPending}
        error={movementError}
        onClose={() => setMovementType(null)}
        onConfirm={(amount: Paisa, reason: string) => {
          if (report === null || movementType === null) return;
          setMovementPending(true);
          void recordCashMovementAction({
            shiftId: report.shiftId,
            type: movementType,
            amount: toPaisaWire(amount),
            reason,
          }).then((result) => {
            setMovementPending(false);
            if (result.ok) {
              toast.show('success', 'Recorded');
              setMovementType(null);
              router.refresh();
            } else {
              setMovementError(result.error ?? 'Could not record this.');
            }
          });
        }}
      />

      {report !== null && (
        <CloseShiftDialog
          open={closeDialogOpen}
          expectedCash={report.expectedCash}
          pending={closePending}
          error={closeError}
          onClose={() => setCloseDialogOpen(false)}
          onConfirm={(countedCash: Paisa, notes: string) =>
            void handleCloseShift(countedCash, notes)
          }
        />
      )}
    </div>
  );
}

function formatClock(value: string | null): string {
  if (value === null) return 'Not configured';
  const [rawHour = '0', minute = '00'] = value.split(':');
  const hour = Number(rawHour);
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function ScheduleValue({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
