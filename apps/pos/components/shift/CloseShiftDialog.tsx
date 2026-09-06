'use client';

import { useState } from 'react';
import { Button, Dialog, Money, NumericKeypad, TextAreaField, cn, digitsToPaisa } from '@natech/ui';
import { paisa, type Paisa } from '@natech/domain';

/**
 * Close a shift — BUILD-PLAN.md §5.9, §12; docs/runfiles/M12-shifts.md.
 *
 * `expectedCash` is shown for reference only — it is never sent. The server
 * recomputes it fresh from `payments`/`cash_movements` at the moment of
 * close, the same "never trust a client-submitted total" rule
 * `finalizeOrderAction` already enforces for a sale.
 */
export interface CloseShiftDialogProps {
  readonly open: boolean;
  readonly expectedCash: Paisa;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onConfirm: (countedCash: Paisa, notes: string) => void;
}

export function CloseShiftDialog({
  open,
  expectedCash,
  pending,
  error,
  onClose,
  onConfirm,
}: CloseShiftDialogProps) {
  const [digits, setDigits] = useState('');
  const [notes, setNotes] = useState('');

  const countedCash = paisa(digitsToPaisa(digits));
  const variance = paisa(countedCash - expectedCash);
  const canSubmit = digits.length > 0 && !pending;

  const handleConfirm = () => {
    if (!canSubmit) return;
    onConfirm(countedCash, notes.trim());
    setDigits('');
    setNotes('');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Close shift"
      description="Count the drawer. The system compares it against what it expects."
      className="w-[min(26rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={!canSubmit} onClick={handleConfirm}>
            {pending ? 'Closing…' : 'Close shift'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-ink-muted">Expected cash</span>
          <Money value={expectedCash} symbol="Rs." />
        </div>

        <NumericKeypad
          // Remounts (and so re-autofocuses) each time the dialog reopens —
          // `Dialog` keeps children mounted across an open/close cycle.
          key={String(open)}
          mode="amount"
          value={digits}
          onChange={setDigits}
          label="Counted cash"
          autoFocus
          onSubmit={handleConfirm}
        />

        {digits.length > 0 && (
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-ink-muted">Variance</span>
            <Money
              value={variance}
              symbol="Rs."
              emphasis="strong"
              className={cn(variance > 0n && 'text-ok', variance < 0n && 'text-danger')}
            />
          </div>
        )}

        <TextAreaField
          label="Notes"
          value={notes}
          onChange={setNotes}
          placeholder="Optional — anything explaining a variance"
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
