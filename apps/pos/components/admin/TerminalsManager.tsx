'use client';

import { useActionState, useState } from 'react';
import { MonitorSmartphone, Plus, ShieldOff, Wifi } from 'lucide-react';
import { Button, DataTable, SelectField, Sheet, StatusPill, Switch, TextField } from '@natech/ui';
import { TERMINAL_IDLE } from '@/lib/terminals/idle';
import {
  createTerminalAction,
  setTerminalActiveAction,
  updateTerminalAction,
} from '@/lib/terminals/actions';
import type { TerminalRow } from '@/lib/terminals/queries';
import { useAutoCloseOnSuccess } from '@/lib/useAutoCloseOnSuccess';
import { PageHeading } from './PageHeading';

/**
 * Terminal registration — BUILD-PLAN.md §5.2, §14.6, M08 runfile "Terminal
 * registration reuses the staff-screen pattern exactly".
 *
 * `pos_terminals` is what §14.2's binding names: the account holding a shift
 * is bound to one of these, and the lock screen's terminal picker
 * (`listActiveTerminals` in `lib/auth/queries.ts`) is drawn from exactly this
 * table. A till that never got registered here cannot be signed in to.
 *
 * Structured like `StaffManager` on purpose — list, an "Add" sheet, a row
 * click opening an edit sheet with its own sub-forms — because the M08 runfile
 * is explicit that this screen reuses that pattern rather than inventing a new
 * one, down to `staff.write` as the permission both screens check.
 *
 * `fbrPosId` has no input anywhere on this screen. §7.3 names it the PRAL
 * device id and M11 is the milestone that registers one; a form field here
 * would be inventing a fiscal identifier nobody issued.
 */
export interface TerminalsManagerProps {
  readonly terminals: readonly TerminalRow[];
}

const POS_TYPE_OPTIONS = [
  { value: 'PRIMARY', label: 'Primary' },
  { value: 'SECONDARY', label: 'Secondary' },
];

export function TerminalsManager({ terminals }: TerminalsManagerProps) {
  const [editing, setEditing] = useState<TerminalRow | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHeading
        title="Terminals"
        note="Register and manage the tills available at sign-in."
        actions={
          <Button tone="primary" icon={Plus} onClick={() => setAdding(true)}>
            Register a terminal
          </Button>
        }
      />

      <DataTable
        rows={terminals}
        getRowId={(terminal) => terminal.id}
        caption="POS terminals"
        onRowClick={setEditing}
        summary={(rows) => (
          <span>
            <strong className="text-ink tabular-nums">{rows.length}</strong> terminals ·{' '}
            <strong className="text-ink tabular-nums">
              {rows.filter((terminal) => terminal.isActive).length}
            </strong>{' '}
            active
          </span>
        )}
        columns={[
          {
            key: 'label',
            header: 'Terminal',
            render: (terminal) => (
              <span className="flex items-center gap-2">
                <MonitorSmartphone aria-hidden="true" className="text-ink-subtle size-4 shrink-0" />
                <span className="font-medium">{terminal.label}</span>
              </span>
            ),
          },
          {
            key: 'posType',
            header: 'Type',
            secondary: true,
            render: (terminal) => (terminal.posType === 'PRIMARY' ? 'Primary' : 'Secondary'),
          },
          {
            key: 'status',
            header: 'Status',
            numeric: true,
            render: (terminal) =>
              terminal.isActive ? (
                <StatusPill size="sm" tone="ok" icon={Wifi} label="Active" />
              ) : (
                <StatusPill size="sm" tone="danger" icon={ShieldOff} label="Deactivated" />
              ),
          },
        ]}
      />

      {adding && <TerminalCreator onClose={() => setAdding(false)} />}
      {editing !== null && (
        <TerminalEditor key={editing.id} terminal={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function Feedback({
  error,
  message,
}: {
  readonly error: string | null;
  readonly message: string | null;
}) {
  if (error !== null) {
    return (
      <p
        role="alert"
        className="border-danger bg-danger-soft text-danger rounded-base border px-3 py-2 text-sm"
      >
        {error}
      </p>
    );
  }
  if (message !== null) {
    return (
      <p
        role="status"
        className="border-ok bg-ok-soft text-ok rounded-base border px-3 py-2 text-sm"
      >
        {message}
      </p>
    );
  }
  return null;
}

function TerminalCreator({ onClose }: { readonly onClose: () => void }) {
  const [state, action, pending] = useActionState(createTerminalAction, TERMINAL_IDLE);
  useAutoCloseOnSuccess(onClose, state.message);
  const [active, setActive] = useState(true);

  return (
    <Sheet
      open
      onClose={onClose}
      title="Register a terminal"
      description="Register a till so staff can select it when signing in."
      side="inline-end"
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="isActive" value={active ? 'true' : 'false'} />
        <TextField label="Label" name="label" placeholder="Till 2" required />
        <SelectField
          label="Type"
          name="posType"
          options={POS_TYPE_OPTIONS}
          defaultValue="PRIMARY"
        />
        <TextField label="MAC address" name="macAddress" autoComplete="off" />
        <TextField label="IP address" name="ipAddress" autoComplete="off" />
        <Switch checked={active} onChange={setActive} label="Terminal can be signed in to" />

        <Feedback error={state.error} message={state.message} />

        <Button tone="primary" block type="submit" disabled={pending}>
          {pending ? 'Registering…' : 'Register the terminal'}
        </Button>
      </form>
    </Sheet>
  );
}

function TerminalEditor({
  terminal,
  onClose,
}: {
  readonly terminal: TerminalRow;
  readonly onClose: () => void;
}) {
  const [details, saveDetails, savingDetails] = useActionState(updateTerminalAction, TERMINAL_IDLE);
  const [activation, saveActivation, savingActivation] = useActionState(
    setTerminalActiveAction,
    TERMINAL_IDLE,
  );
  useAutoCloseOnSuccess(onClose, details.message, activation.message);

  return (
    <Sheet open onClose={onClose} title={terminal.label} side="inline-end">
      <div className="space-y-6">
        <form action={saveDetails} className="space-y-4">
          <input type="hidden" name="terminalId" value={terminal.id} />
          <TextField label="Label" name="label" defaultValue={terminal.label} required />
          <SelectField
            label="Type"
            name="posType"
            options={POS_TYPE_OPTIONS}
            defaultValue={terminal.posType}
          />
          <TextField
            label="MAC address"
            name="macAddress"
            defaultValue={terminal.macAddress ?? ''}
            autoComplete="off"
          />
          <TextField
            label="IP address"
            name="ipAddress"
            defaultValue={terminal.ipAddress ?? ''}
            autoComplete="off"
          />

          <Feedback error={details.error} message={details.message} />

          <Button tone="primary" type="submit" disabled={savingDetails}>
            {savingDetails ? 'Saving…' : 'Save terminal'}
          </Button>
        </form>

        <section className="border-border rounded-base border p-3">
          <h3 className="mb-1 text-sm font-semibold">Can be signed in to</h3>
          <form action={saveActivation} className="space-y-3">
            <input type="hidden" name="terminalId" value={terminal.id} />
            <input type="hidden" name="active" value={terminal.isActive ? 'false' : 'true'} />
            <p className="text-ink-subtle text-xs">
              {terminal.isActive
                ? 'Deactivating removes it from the terminal picker on the lock screen. Its history — shifts, orders, audit rows — stays intact.'
                : 'This terminal cannot be bound to a shift and does not appear on the sign-in terminal picker.'}
            </p>
            <Feedback error={activation.error} message={activation.message} />
            <Button
              size="sm"
              tone={terminal.isActive ? 'danger' : 'secondary'}
              type="submit"
              disabled={savingActivation}
            >
              {terminal.isActive ? 'Deactivate' : 'Reactivate'}
            </Button>
          </form>
        </section>
      </div>
    </Sheet>
  );
}
