'use client';

import { useState } from 'react';
import {
  Button,
  Dialog,
  Money,
  NumericKeypad,
  SegmentedControl,
  SelectField,
  digitsToPaisa,
} from '@natech/ui';
import { paisa, type Paisa } from '@natech/domain';

/**
 * Order discount — BUILD-PLAN.md §6.8, §14.1, §17, §8.
 *
 * A discount is an exception, and §17 requires every one of them to appear in
 * the exceptions report with an actor and a reason. So a reason code is not
 * optional here, and a discount above the supervisor threshold asks for a PIN.
 *
 * §6.8 `discountBeforeTax` is true by default, which means the amount entered
 * here reduces the taxable base and therefore the tax. That is the reason the
 * dialog states the effect rather than just taking a number.
 *
 * §8 blocks a supervisor-threshold discount while the terminal is offline,
 * because the approval cannot be verified against anything.
 *
 * ADR 0028 — a discount can be keyed as whole percent of the subtotal. It is
 * converted to paisa here and stored as an amount, exactly like a rupee
 * discount, so the order, the invoice and the exceptions report never learn a
 * second representation; the percent is kept only in the reason text, where
 * a manager reading the report can see what was actually offered.
 */
const SUPERVISOR_THRESHOLD: Paisa = paisa(50000n);

const REASONS = [
  { value: '', label: 'Choose a reason' },
  { value: 'Long wait', label: 'Long wait' },
  { value: 'Kitchen error', label: 'Kitchen error' },
  { value: 'Manager courtesy', label: 'Manager courtesy' },
  { value: 'Staff meal', label: 'Staff meal' },
  { value: 'Promotion', label: 'Promotion' },
] as const;

/** Whole percent of a paisa subtotal, rounded half up to the paisa. */
export function percentOf(subtotal: Paisa, percent: bigint): Paisa {
  return paisa((subtotal * percent + 50n) / 100n);
}

export interface DiscountDialogProps {
  readonly open: boolean;
  readonly subtotal: Paisa;
  readonly offline: boolean;
  readonly onClose: () => void;
  readonly onApply: (amount: Paisa, reason: string) => void;
}

export function DiscountDialog({ open, subtotal, offline, onClose, onApply }: DiscountDialogProps) {
  const [mode, setMode] = useState<'amount' | 'percent'>('amount');
  const [digits, setDigits] = useState('');
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');

  const percent = digitsToPaisa(digits);
  const amount = mode === 'percent' ? percentOf(subtotal, percent) : paisa(digitsToPaisa(digits));
  const needsSupervisor = amount > SUPERVISOR_THRESHOLD;
  const tooLarge = amount > subtotal;
  const blockedOffline = offline && needsSupervisor;

  const ready =
    amount > 0n &&
    !tooLarge &&
    reason !== '' &&
    !blockedOffline &&
    (!needsSupervisor || pin.length >= 4);

  const handleApply = () => {
    if (!ready) return;
    onApply(amount, mode === 'percent' ? `${reason} (${percent.toString()}%)` : reason);
    setDigits('');
    setReason('');
    setPin('');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Discount this order"
      description="Applied before tax, so it reduces the taxable base and the tax with it."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={!ready} onClick={handleApply}>
            Apply discount
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-ink-muted">Subtotal (ex tax)</span>
          <Money value={subtotal} symbol="Rs." />
        </div>

        <SegmentedControl
          label="Discount by"
          value={mode}
          onChange={(next) => {
            // The digits mean something different in the other mode, so they
            // are cleared rather than silently reinterpreted.
            setMode(next);
            setDigits('');
          }}
          options={[
            { value: 'amount', label: 'Amount (Rs.)' },
            { value: 'percent', label: 'Percent (%)' },
          ]}
        />

        <NumericKeypad
          // Remounts (and so re-autofocuses) every time the dialog reopens —
          // `Dialog` keeps children mounted across an open/close cycle, so
          // without this the keypad only ever focuses itself the first time.
          // The mode is in the key too, so switching refocuses the keypad.
          key={`${String(open)}-${mode}`}
          mode={mode}
          value={digits}
          onChange={setDigits}
          label={mode === 'percent' ? 'Discount percent' : 'Discount amount'}
          autoFocus
          onSubmit={handleApply}
        />

        {mode === 'percent' && (
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-ink-muted">Discount</span>
            <Money value={amount} symbol="Rs." emphasis="strong" />
          </div>
        )}

        <SelectField
          label="Reason"
          help="Appears in the discounts exception report against your name."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          options={REASONS.map((entry) => ({ value: entry.value, label: entry.label }))}
          required
        />

        {tooLarge && (
          <p role="alert" className="text-danger text-sm font-medium">
            A discount cannot exceed the subtotal.
          </p>
        )}

        {needsSupervisor && !blockedOffline && (
          <div className="border-warn bg-warn-soft rounded-base border p-3">
            <p className="text-warn mb-2 text-sm font-medium">
              Above <Money value={SUPERVISOR_THRESHOLD} symbol="Rs." trimWholeRupees /> needs a
              supervisor.
            </p>
            <NumericKeypad
              key={String(open)}
              mode="pin"
              value={pin}
              onChange={setPin}
              label="Supervisor PIN"
              autoFocus
              onSubmit={handleApply}
            />
          </div>
        )}

        {blockedOffline && (
          <p role="alert" className="text-danger text-sm font-medium">
            A supervisor discount cannot be approved while the terminal is offline. Take the order
            and apply it once the connection returns.
          </p>
        )}
      </div>
    </Dialog>
  );
}
