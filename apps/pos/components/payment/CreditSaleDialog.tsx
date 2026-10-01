'use client';

import { useEffect, useState } from 'react';
import { BookUser } from 'lucide-react';
import { Button, Dialog, Money, TextField, cn } from '@natech/ui';
import { paisa, parsePaisa, subtract, type Paisa } from '@natech/domain';
import { listTillAccountsAction, type TillAccount } from '@/lib/accounts/actions';

/**
 * The credit sale — ADR 0036.
 *
 * A walk-in has no account and this dialog cannot make one: it lists only the
 * accounts the owner has opened. The cashier picks the customer, optionally
 * takes some cash now, and the rest goes on the account when the invoice is
 * finalized. The balance and limit shown are for the cashier's eyes; finalize
 * re-reads both under lock and refuses a sale that would breach the limit.
 *
 * Mounted with a fresh `key` per opening (as `CustomerDialog` is), so a
 * previous sale's choice can never carry into the next.
 */
export function CreditSaleDialog({
  open,
  total,
  pending,
  onClose,
  onConfirm,
}: {
  readonly open: boolean;
  readonly total: Paisa | null;
  readonly pending: boolean;
  readonly onClose: () => void;
  readonly onConfirm: (accountId: string, paidNow: Paisa, name: string) => void;
}) {
  const [accounts, setAccounts] = useState<readonly TillAccount[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paidText, setPaidText] = useState('');

  useEffect(() => {
    if (!open) return;
    let live = true;
    void listTillAccountsAction().then((result) => {
      if (!live) return;
      setLoadError(result.error);
      setAccounts(result.accounts);
    });
    return () => {
      live = false;
    };
  }, [open]);

  let paidNow: Paisa | null = paisa(0n);
  if (paidText.trim() !== '') {
    try {
      paidNow = parsePaisa(paidText.trim().replace(/,/g, ''));
    } catch {
      paidNow = null;
    }
  }
  const onAccount = total !== null && paidNow !== null ? subtract(total, paidNow) : null;
  const needle = search.trim().toLowerCase();
  const visible = (accounts ?? []).filter(
    (account) =>
      needle === '' ||
      account.name.toLowerCase().includes(needle) ||
      (account.phone ?? '').replace(/\s/g, '').includes(needle.replace(/\s/g, '')),
  );
  const selected = (accounts ?? []).find((account) => account.id === selectedId) ?? null;
  const overLimit =
    selected !== null &&
    selected.creditLimit !== null &&
    onAccount !== null &&
    parsePaisa(selected.balance) + onAccount > parsePaisa(selected.creditLimit);
  const ready =
    selected !== null &&
    paidNow !== null &&
    paidNow >= 0n &&
    onAccount !== null &&
    onAccount > 0n &&
    !overLimit &&
    !pending;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Credit sale"
      description="Put this invoice on a customer's account. Walk-in customers have no account."
      className="w-[min(34rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button onClick={onClose}>Back to order</Button>
          <Button
            tone="primary"
            icon={BookUser}
            disabled={!ready}
            onClick={() => {
              if (selected !== null && paidNow !== null)
                onConfirm(selected.id, paidNow, selected.name);
            }}
          >
            {pending ? (
              'Finalizing…'
            ) : (
              <>
                Put on account · <Money value={onAccount ?? paisa(0n)} symbol="Rs." />
              </>
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField
          label="Find account"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name or mobile number"
          autoFocus
        />
        <div
          className="max-h-64 space-y-1.5 overflow-y-auto"
          role="radiogroup"
          aria-label="Account"
        >
          {accounts === null && loadError === null && (
            <p className="text-ink-muted text-sm">Loading accounts…</p>
          )}
          {loadError !== null && <p className="text-danger text-sm">{loadError}</p>}
          {accounts !== null && visible.length === 0 && (
            <p className="text-ink-muted text-sm">
              {accounts.length === 0
                ? 'No credit accounts yet. The owner opens them under Accounts › Credit customers.'
                : 'No account matches.'}
            </p>
          )}
          {visible.map((account) => {
            const active = account.id === selectedId;
            return (
              <button
                key={account.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setSelectedId(account.id)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-base border px-3 py-2 text-start text-sm',
                  active
                    ? 'border-primary bg-surface-sunken ring-primary ring-1'
                    : 'border-border bg-surface',
                )}
              >
                <span>
                  <span className="block font-medium">{account.name}</span>
                  <span className="text-ink-subtle block text-xs">{account.phone ?? ''}</span>
                </span>
                <span className="text-end text-xs">
                  <span className="block">
                    Owes <Money value={parsePaisa(account.balance)} />
                  </span>
                  <span className="text-ink-subtle block">
                    {account.creditLimit === null ? (
                      'No limit'
                    ) : (
                      <>
                        Limit <Money value={parsePaisa(account.creditLimit)} />
                      </>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <TextField
          label="Cash paid now (Rs.)"
          help="Leave blank if the whole bill goes on the account."
          value={paidText}
          onChange={(event) => setPaidText(event.target.value)}
          inputMode="decimal"
          placeholder="0.00"
          error={paidNow === null ? 'Enter rupees, e.g. 500.' : undefined}
        />
        {total !== null && (
          <dl className="border-border bg-surface-sunken space-y-1 rounded-base border p-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-muted">Invoice total</dt>
              <dd>
                <Money value={total} symbol="Rs." />
              </dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>On account</dt>
              <dd>
                <Money value={onAccount ?? paisa(0n)} symbol="Rs." />
              </dd>
            </div>
          </dl>
        )}
        {overLimit && (
          <p role="alert" className="text-danger text-sm">
            This would take {selected.name} over their credit limit. Take more cash now, or ask the
            owner to raise the limit.
          </p>
        )}
      </div>
    </Dialog>
  );
}
