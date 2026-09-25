'use client';

import { useActionState } from 'react';
import { Plus, Save, UserCheck, UserX } from 'lucide-react';
import { Button, TextField } from '@natech/ui';
import {
  createEmployeeAction,
  setEmployeeActiveAction,
  updateEmployeeAction,
  type AttendanceActionState,
} from '@/lib/attendance/actions';
import type { EmployeeRow } from '@/lib/attendance/queries';

const IDLE: AttendanceActionState = { error: null, message: null };

function Feedback({ state }: { readonly state: AttendanceActionState }) {
  return (
    <>
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
    </>
  );
}

/**
 * The staff register — ADR 0032. Owner-only; the page and every action check
 * `staff.write`. People are deactivated, never deleted: a person who has left
 * still has attendance on the book.
 */
export function EmployeeManager({ rows }: { readonly rows: readonly EmployeeRow[] }) {
  const [state, action, pending] = useActionState(createEmployeeAction, IDLE);
  return (
    <div className="space-y-5">
      <form action={action} className="border-border bg-surface-raised rounded-base border p-4">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Add a person</h2>
            <p className="text-ink-muted text-sm">
              Everyone who works here, with or without a POS login. They appear on the attendance
              register from today.
            </p>
          </div>
          <Button type="submit" tone="primary" icon={Plus} disabled={pending}>
            {pending ? 'Adding…' : 'Add'}
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <TextField name="name" label="Name" required />
          <TextField name="jobTitle" label="Job title" placeholder="Cook, rider, cashier" />
          <TextField name="phone" label="Phone" inputMode="tel" placeholder="Optional" />
        </div>
        <div className="mt-3">
          <Feedback state={state} />
        </div>
      </form>

      <ul className="space-y-3" aria-label="Staff register">
        {rows.map((row) => (
          <EmployeeRowForm key={row.id} row={row} />
        ))}
      </ul>
    </div>
  );
}

function EmployeeRowForm({ row }: { readonly row: EmployeeRow }) {
  const [state, action, pending] = useActionState(updateEmployeeAction.bind(null, row.id), IDLE);
  return (
    <li className="border-border rounded-base border p-3">
      <form action={action} className="grid items-end gap-3 md:grid-cols-[1fr_1fr_1fr_auto_auto]">
        <TextField name="name" label="Name" defaultValue={row.name} required />
        <TextField name="jobTitle" label="Job title" defaultValue={row.jobTitle ?? ''} />
        <TextField name="phone" label="Phone" defaultValue={row.phone ?? ''} inputMode="tel" />
        <Button type="submit" tone="secondary" icon={Save} disabled={pending}>
          Save
        </Button>
        <Button
          type="button"
          tone="ghost"
          icon={row.isActive ? UserX : UserCheck}
          onClick={() => void setEmployeeActiveAction(row.id, !row.isActive)}
        >
          {row.isActive ? 'Deactivate' : 'Reactivate'}
        </Button>
      </form>
      {!row.isActive && (
        <p className="text-ink-subtle mt-2 text-xs">Inactive — not on the register.</p>
      )}
      <Feedback state={state} />
    </li>
  );
}
