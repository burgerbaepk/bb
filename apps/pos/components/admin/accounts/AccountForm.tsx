'use client';

import { useActionState } from 'react';
import { Save } from 'lucide-react';
import { Button, TextField } from '@natech/ui';
import { saveAccountAction, type AccountActionState } from '@/lib/accounts/actions';
import type { AccountRow } from '@/lib/accounts/queries';
import { FormOutcome } from '../purchasing/FormOutcome';

const IDLE: AccountActionState = { error: null, message: null };

const rupeeText = (value: bigint | null) =>
  value === null ? '' : `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;

/**
 * Open a credit account, or change one — ADR 0036. Owner-only; the page
 * renders this only for `staff.write`, and the action checks again.
 */
export function AccountForm({ account }: { readonly account?: AccountRow | undefined }) {
  const [state, action, pending] = useActionState(saveAccountAction, IDLE);
  return (
    <form
      key={account === undefined ? (state.message ?? 'new') : account.id}
      action={action}
      className="border-border bg-surface-raised no-print rounded-base border p-4"
    >
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold">
            {account === undefined ? 'Open a credit account' : 'Account details'}
          </h2>
          <p className="text-ink-muted text-sm">
            Only for customers you have agreed to give credit. Everyone else stays a walk-in and
            pays at the counter.
          </p>
        </div>
        <Button type="submit" tone="primary" icon={Save} disabled={pending}>
          {pending ? 'Saving…' : account === undefined ? 'Open account' : 'Save'}
        </Button>
      </div>
      {account !== undefined && <input type="hidden" name="id" value={account.id} />}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <TextField name="name" label="Customer name" defaultValue={account?.name} required />
        <TextField
          name="phone"
          label="Mobile number"
          inputMode="tel"
          defaultValue={account?.phone ?? ''}
          placeholder="03XX XXXXXXX"
          required
        />
        <TextField
          name="creditLimit"
          label="Credit limit (Rs.)"
          help="Blank for no limit. The till refuses a sale that would go over it."
          inputMode="decimal"
          defaultValue={rupeeText(account?.creditLimit ?? null)}
        />
        <TextField
          name="openingBalance"
          label="Opening balance owed (Rs.)"
          help="What they already owed on the day you started this book."
          inputMode="decimal"
          defaultValue={account === undefined ? '' : rupeeText(account.openingBalance)}
        />
        <TextField
          name="note"
          label="Note"
          className="md:col-span-2"
          defaultValue={account?.note ?? ''}
          placeholder="Company, terms, who may sign"
        />
      </div>
      <FormOutcome state={state} />
    </form>
  );
}
