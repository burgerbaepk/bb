'use client';

import { useActionState, useState } from 'react';
import { Save } from 'lucide-react';
import { Button, Switch, TextAreaField, TextField } from '@natech/ui';
import { saveServiceChargeSettingsAction } from '@/lib/tax/actions';
import type { ServiceChargeSettings as Values } from '@/lib/tax/queries';

const IDLE = { error: null, message: null };

export function ServiceChargeSettings({ values }: { readonly values: Values }) {
  const [state, action, pending] = useActionState(saveServiceChargeSettingsAction, IDLE);
  const [enabled, setEnabled] = useState(values.enabled);
  const [taxEnabled, setTaxEnabled] = useState(values.taxEnabled);
  const [posFeeEnabled, setPosFeeEnabled] = useState(values.posFeeEnabled);
  const [reason, setReason] = useState('');

  return (
    <form action={action} className="border-border bg-surface-raised mb-5 rounded-base border p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Tax and billing charges</h2>
          <p className="text-ink-muted mt-1 max-w-2xl text-sm">
            These outlet-wide switches control tax, the dine-in service charge, and the fixed Rs.1
            POS fee in terminal totals, bills, and receipts.
          </p>
        </div>
        <Button type="submit" tone="primary" icon={Save} disabled={pending}>
          {pending ? 'Saving…' : 'Save billing settings'}
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <Switch checked={taxEnabled} onChange={setTaxEnabled} label="Calculate sales tax" />
          <input type="hidden" name="taxEnabled" value={String(taxEnabled)} />
        </div>
        <div>
          <Switch checked={enabled} onChange={setEnabled} label="Add service charge by default" />
          <input type="hidden" name="enabled" value={String(enabled)} />
        </div>
        <div>
          <Switch
            checked={posFeeEnabled}
            onChange={setPosFeeEnabled}
            label="Add Rs.1 POS service fee"
          />
          <input type="hidden" name="posFeeEnabled" value={String(posFeeEnabled)} />
        </div>
        <TextField
          name="defaultBps"
          label="Default rate (basis points)"
          help="500 basis points = 5%."
          defaultValue={String(values.defaultBps)}
          inputMode="numeric"
        />
        <TextAreaField
          label="Reason for change"
          help="Required because this changes customer billing."
          value={reason}
          onChange={setReason}
        />
        <input type="hidden" name="reason" value={reason} />
      </div>
      {state.error !== null && (
        <p role="alert" className="text-danger mt-3 text-sm">
          {state.error}
        </p>
      )}
      {state.message !== null && (
        <p role="status" className="text-ok mt-3 text-sm">
          {state.message}
        </p>
      )}
    </form>
  );
}
