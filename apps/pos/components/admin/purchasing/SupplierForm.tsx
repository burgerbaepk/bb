'use client';

import { useActionState } from 'react';
import { Save } from 'lucide-react';
import { Button, TextField } from '@natech/ui';
import { saveSupplierAction, type PurchasingActionState } from '@/lib/purchasing/actions';
import type { SupplierRow } from '@/lib/purchasing/queries';
import { FormOutcome } from './FormOutcome';

const IDLE: PurchasingActionState = { error: null, message: null };

/** Rupees as the box shows them: `12500.5` → `12500.50`. */
const rupeeText = (value: bigint) =>
  `${value < 0n ? '-' : ''}${(value < 0n ? -value : value) / 100n}.${String((value < 0n ? -value : value) % 100n).padStart(2, '0')}`;

/**
 * Add or change a supplier — ADR 0035. The page renders this only for
 * `expenses.write` (owner or manager), and the action checks again.
 */
export function SupplierForm({ supplier }: { readonly supplier?: SupplierRow | undefined }) {
  const [state, action, pending] = useActionState(saveSupplierAction, IDLE);
  return (
    <form
      // A fresh blank form after each add; an edit keeps what was typed.
      key={supplier === undefined ? (state.message ?? 'new') : supplier.id}
      action={action}
      className="border-border bg-surface-raised no-print rounded-base border p-4"
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold">{supplier === undefined ? 'Add a supplier' : 'Details'}</h2>
          <p className="text-ink-muted text-sm">
            Every supplier added or changed is recorded in the activity log.
          </p>
        </div>
        <Button type="submit" tone="primary" icon={Save} disabled={pending}>
          {pending ? 'Saving…' : supplier === undefined ? 'Add supplier' : 'Save'}
        </Button>
      </div>
      {supplier !== undefined && <input type="hidden" name="id" value={supplier.id} />}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <TextField name="name" label="Name" defaultValue={supplier?.name} required />
        <TextField
          name="contactPerson"
          label="Contact person"
          defaultValue={supplier?.contactPerson ?? ''}
        />
        <TextField name="phone" label="Phone" defaultValue={supplier?.phone ?? ''} />
        <TextField name="address" label="Address" defaultValue={supplier?.address ?? ''} />
        <TextField name="ntn" label="NTN" defaultValue={supplier?.ntn ?? ''} />
        <TextField
          name="openingBalance"
          label="Opening balance owed (Rs.)"
          help="What was already owed to them on the day you started this book."
          inputMode="decimal"
          defaultValue={supplier === undefined ? '' : rupeeText(supplier.openingBalance)}
        />
        <TextField
          name="note"
          label="Note"
          className="md:col-span-2 xl:col-span-3"
          defaultValue={supplier?.note ?? ''}
          placeholder="Payment terms, what they supply"
        />
      </div>
      <FormOutcome state={state} />
    </form>
  );
}
