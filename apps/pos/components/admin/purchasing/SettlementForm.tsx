'use client';

import { useActionState, useState } from 'react';
import { HandCoins } from 'lucide-react';
import { Button, Money, TextField } from '@natech/ui';
import type { Paisa } from '@natech/domain';
import {
  SETTLEMENT_LABEL,
  SETTLEMENT_METHODS,
  type SettlementMethod,
} from '@/lib/purchasing/rules';
import { FormOutcome } from './FormOutcome';

type State = { readonly error: string | null; readonly message: string | null };
const IDLE: State = { error: null, message: null };
const SELECT = 'border-border bg-surface mt-1 min-h-touch w-full rounded-base border px-3';

/**
 * Money paid to a supplier (ADR 0035) or received from an account customer
 * (ADR 0036). One form for both, because the till rules are one rule —
 * `refuseSettlement` — and two forms would drift apart on it.
 *
 * `partyField` names the hidden id the action reads (`supplierId` or
 * `accountId`). The till box is offered only while a shift is open and only
 * for cash; the action refuses both anyway.
 */
export function SettlementForm({
  action: serverAction,
  partyField,
  partyId,
  formKey,
  title,
  balance,
  balanceLabel,
  tillLabel,
  today,
  shiftOpen,
}: {
  readonly action: (state: State, form: FormData) => Promise<State>;
  readonly partyField: string;
  readonly partyId: string;
  /** R3 — minted by the server page; a new one arrives with each revalidation. */
  readonly formKey: string;
  readonly title: string;
  readonly balance: Paisa;
  readonly balanceLabel: string;
  readonly tillLabel: string;
  readonly today: string;
  readonly shiftOpen: boolean;
}) {
  const [state, action, pending] = useActionState(serverAction, IDLE);
  const [method, setMethod] = useState<SettlementMethod>('CASH');
  return (
    <form
      key={formKey}
      action={action}
      className="border-border bg-surface-raised no-print rounded-base border p-4"
    >
      <input type="hidden" name="formKey" value={formKey} />
      <input type="hidden" name={partyField} value={partyId} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-ink-muted text-sm">
            {balanceLabel}: <Money value={balance} symbol="Rs." emphasis="strong" />. Payments
            cannot be edited — check the amount before saving.
          </p>
        </div>
        <Button type="submit" tone="primary" icon={HandCoins} disabled={pending || balance <= 0n}>
          {pending ? 'Saving…' : 'Record payment'}
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <TextField
          name="amount"
          label="Amount (Rs.)"
          inputMode="decimal"
          placeholder="0.00"
          required
        />
        <label className="text-sm font-medium">
          Method
          <select
            name="method"
            value={method}
            onChange={(event) => setMethod(event.target.value as SettlementMethod)}
            className={SELECT}
          >
            {SETTLEMENT_METHODS.map((value) => (
              <option key={value} value={value}>
                {SETTLEMENT_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
        <TextField name="reference" label="Reference" placeholder="Cheque or transfer no." />
        <TextField
          name="occurredOn"
          type="date"
          label="Date"
          defaultValue={today}
          max={today}
          required
        />
        <TextField
          name="note"
          label="Note"
          className="md:col-span-2"
          placeholder="Optional"
          maxLength={240}
        />
        {method === 'CASH' && (
          <label className="flex items-start gap-2 text-sm md:col-span-2">
            <input
              type="checkbox"
              name="throughTill"
              disabled={!shiftOpen}
              className="mt-1 size-4"
            />
            <span>
              <span className="font-medium">{tillLabel}</span>
              <span className="text-ink-muted block">
                {shiftOpen
                  ? 'Recorded on the open shift so the drawer still balances. Today only.'
                  : 'No shift is open, so nothing can go through the till.'}
              </span>
            </span>
          </label>
        )}
      </div>
      <FormOutcome state={state} />
    </form>
  );
}
