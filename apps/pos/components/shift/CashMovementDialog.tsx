'use client';

import { useState } from 'react';
import { Button, Dialog, Money, NumericKeypad, TextField, digitsToPaisa } from '@natech/ui';
import { paisa, type Paisa } from '@natech/domain';
import type { CashMovementType } from '@natech/contracts';

const TITLES: Readonly<Record<CashMovementType, string>> = {
  PAY_IN: 'Pay in',
  PAY_OUT: 'Pay out',
  DROP: 'Cash drop',
};

const DESCRIPTIONS: Readonly<Record<CashMovementType, string>> = {
  PAY_IN: 'Cash added to the drawer — a float top-up, a returned change fund, and so on.',
  PAY_OUT: 'Cash taken from the drawer for a small purchase or expense, paid in cash.',
  DROP: 'Cash removed to the safe, reducing what the drawer is expected to hold.',
};

/**
 * Pay-in / pay-out / drop — BUILD-PLAN.md §5.9, §12; docs/runfiles/M12-shifts.md.
 *
 * One dialog for all three types (§6.13's own reasoning for the shared
 * `PinConfirmDialog` shape applies equally here) — the copy and the sign of
 * the amount against `expectedCash` change; the form does not.
 */
export interface CashMovementDialogProps {
  readonly type: CashMovementType | null;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onConfirm: (amount: Paisa, reason: string) => void;
}

export function CashMovementDialog({
  type,
  pending,
  error,
  onClose,
  onConfirm,
}: CashMovementDialogProps) {
  const [digits, setDigits] = useState('');
  const [reason, setReason] = useState('');

  if (type === null) return null;
  const amount = paisa(digitsToPaisa(digits));
  const canSubmit = amount > 0n && reason.trim().length > 0 && !pending;

  const handleConfirm = () => {
    if (!canSubmit) return;
    onConfirm(amount, reason.trim());
    setDigits('');
    setReason('');
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={TITLES[type]}
      description={DESCRIPTIONS[type]}
      className="w-[min(24rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={!canSubmit} onClick={handleConfirm}>
            {pending ? 'Recording…' : TITLES[type]}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <NumericKeypad
          mode="amount"
          value={digits}
          onChange={setDigits}
          label="Amount"
          autoFocus
          onSubmit={handleConfirm}
        />
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-ink-muted">Amount</span>
          <Money value={amount} symbol="Rs." />
        </div>
        <TextField
          label="Reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Why is this being recorded?"
        />
        {error !== null && (
          <p role="alert" className="text-danger text-sm font-medium">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
