'use client';

import { useState } from 'react';
import { Button, Dialog, Money, NumericKeypad, digitsToPaisa } from '@natech/ui';
import { paisa, type Paisa } from '@natech/domain';

/**
 * Open a shift — BUILD-PLAN.md §5.9, §12; docs/runfiles/M12-shifts.md.
 *
 * Float defaults to zero, same as the schema's own column default and the
 * auto-open cron's figure — a cashier who starts with cash already in the
 * drawer records it here rather than the dialog inventing a carried-forward
 * number from a previous shift that may never have been counted correctly.
 */
export interface OpenShiftDialogProps {
  readonly open: boolean;
  readonly pending: boolean;
  readonly onClose: () => void;
  readonly onConfirm: (openingFloat: Paisa) => void;
}

export function OpenShiftDialog({ open, pending, onClose, onConfirm }: OpenShiftDialogProps) {
  const [digits, setDigits] = useState('');
  const amount = paisa(digitsToPaisa(digits));

  const handleConfirm = () => {
    if (pending) return;
    onConfirm(amount);
    setDigits('');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Open shift"
      description="Count the float in the drawer before the first sale."
      className="w-[min(24rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={pending} onClick={handleConfirm}>
            {pending ? 'Opening…' : 'Open shift'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <NumericKeypad
          // Remounts (and so re-autofocuses) each time the dialog reopens —
          // `Dialog` keeps children mounted across an open/close cycle.
          key={String(open)}
          mode="amount"
          value={digits}
          onChange={setDigits}
          label="Opening float"
          autoFocus
          onSubmit={handleConfirm}
        />
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-ink-muted">Opening float</span>
          <Money value={amount} symbol="Rs." />
        </div>
      </div>
    </Dialog>
  );
}
