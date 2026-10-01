'use client';

import { useActionState } from 'react';
import { Ban } from 'lucide-react';
import { Button, TextField } from '@natech/ui';
import { cancelSupplierBillAction, type PurchasingActionState } from '@/lib/purchasing/actions';
import { FormOutcome } from './FormOutcome';

const IDLE: PurchasingActionState = { error: null, message: null };

/** Cancel a posted bill — ADR 0035. A counter-entry with a reason, never a delete. */
export function CancelBillForm({ billId }: { readonly billId: string }) {
  const [state, action, pending] = useActionState(
    cancelSupplierBillAction.bind(null, billId),
    IDLE,
  );
  return (
    <form
      action={action}
      className="border-border bg-surface-raised no-print rounded-base border p-4"
    >
      <h2 className="font-semibold">Cancel this bill</h2>
      <p className="text-ink-muted mb-3 text-sm">
        Takes it off the supplier&apos;s balance and returns its goods out of stock. Refused if the
        stock has already been used. Enter the correct bill afterwards.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          name="cancelReason"
          label="Reason"
          placeholder="Entered twice, wrong amounts"
          required
          className="min-w-64 flex-1"
        />
        <Button type="submit" icon={Ban} disabled={pending} className="text-danger">
          {pending ? 'Cancelling…' : 'Cancel bill'}
        </Button>
      </div>
      <FormOutcome state={state} />
    </form>
  );
}
