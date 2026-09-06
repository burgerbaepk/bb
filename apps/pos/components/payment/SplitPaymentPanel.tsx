'use client';

import { useState } from 'react';
import { Button, Money, NumericKeypad, digitsToPaisa } from '@natech/ui';
import { paisa, type Paisa } from '@natech/domain';
import type { PaymentMethod } from '@natech/contracts';
import { PAYMENT_METHOD_LABELS } from '@/components/lib/format';

/**
 * Split payments — BUILD-PLAN.md §6.6.
 *
 * `splitPaymentTaxPolicy` is `PROPORTIONAL`: the taxable base is allocated
 * across methods in proportion to what was tendered against each, tax is
 * computed per slice, and the slices are summed. The worked example in §6.6 is
 * a base of 10,000 paying 6,000 on card at 8% and 4,000 in cash at 16%, giving
 * 480.00 plus 640.00.
 *
 * Each slice becomes its own `invoice_tax_lines` row with its own
 * `payment_method_scope`, which makes the split visible in tax reports
 * rather than averaged away.
 *
 * The mix locks at finalize. Changing a method afterwards takes a credit note
 * and a fresh invoice, never an edit (R5).
 */
export interface SplitPaymentPanelProps {
  readonly method: PaymentMethod;
  readonly outstanding: Paisa;
  readonly onAdd: (amount: Paisa) => void;
}

export function SplitPaymentPanel({ method, outstanding, onAdd }: SplitPaymentPanelProps) {
  const [digits, setDigits] = useState('');
  const amount = paisa(digitsToPaisa(digits));
  const valid = amount > 0n && amount <= outstanding;

  const handleAdd = () => {
    if (!valid) return;
    onAdd(amount);
    setDigits('');
  };

  return (
    <section className="border-border bg-surface-raised space-y-3 rounded-base border p-3">
      <h3 className="text-sm font-semibold">
        Part payment on {PAYMENT_METHOD_LABELS[method].toLowerCase()}
      </h3>
      <p className="text-ink-subtle text-xs">
        The taxable base is split in proportion to what is tendered against each method, and each
        slice is taxed at its own rate.
      </p>

      <NumericKeypad
        mode="amount"
        value={digits}
        onChange={setDigits}
        label="Part amount"
        autoFocus
        onSubmit={handleAdd}
      />

      <div className="flex items-center justify-between gap-2">
        <span className="text-ink-muted text-sm">
          Outstanding <Money value={outstanding} symbol="Rs." />
        </span>
        <Button tone="primary" disabled={!valid} onClick={handleAdd}>
          Add part
        </Button>
      </div>

      {amount > outstanding && (
        <p role="alert" className="text-danger text-xs font-medium">
          A part payment cannot exceed what is outstanding.
        </p>
      )}
    </section>
  );
}
