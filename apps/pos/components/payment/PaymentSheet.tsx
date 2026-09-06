'use client';

import { Banknote, ShieldCheck } from 'lucide-react';
import { Button, Money, Sheet } from '@natech/ui';
import { ZERO, computeTotals, type TaxPolicy, type TaxRule } from '@natech/domain';
import {
  toDomainLines,
  type Order,
  type PaymentMethod,
  type PaymentSliceDraft,
} from '@natech/contracts';
import { formatRate } from '@/components/lib/format';

export interface PaymentSheetProps {
  readonly open: boolean;
  readonly order: Order;
  readonly taxPolicy: TaxPolicy;
  readonly taxRules: readonly TaxRule[];
  readonly method: PaymentMethod;
  readonly onMethodChange: (method: PaymentMethod) => void;
  readonly finalizing: boolean;
  readonly onClose: () => void;
  readonly onFinalize: (slices: readonly PaymentSliceDraft[]) => void;
}

/** Compact fallback for payment opened from an existing floor order. */
export function PaymentSheet({
  open,
  order,
  taxPolicy,
  taxRules,
  finalizing,
  onClose,
  onFinalize,
}: PaymentSheetProps) {
  if (order.lines.every((line) => line.voidReason !== null)) {
    return <Sheet open={false} onClose={onClose} title="Payment" side="inline-end" />;
  }

  const selectedMethod = 'CASH';
  const totals = computeTotals({
    lines: toDomainLines(order),
    orderType: order.type,
    deliveryCharge: order.deliveryCharge,
    orderDiscount: order.orderDiscount,
    payments: [{ method: selectedMethod, amount: ZERO }],
    serviceStartedAt: order.serviceStartedAt,
    rules: taxRules,
    policy: taxPolicy,
  });

  const finalize = () =>
    onFinalize([
      {
        method: selectedMethod,
        amount: totals.grandTotal,
        attemptStatus: 'APPROVED',
        declinedReason: null,
      },
    ]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Payment · Order #${order.orderNo}`}
      description="Confirm the cash sale, then create the invoice."
      side="inline-end"
      footer={
        <>
          <Button onClick={onClose}>Back to order</Button>
          <Button tone="primary" icon={ShieldCheck} disabled={finalizing} onClick={finalize}>
            {finalizing ? (
              'Finalizing…'
            ) : (
              <>
                Charge & invoice · <Money value={totals.grandTotal} symbol="Rs." />
              </>
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section>
          <h3 className="mb-2 text-sm font-semibold">Payment method</h3>
          <div className="bg-ok-soft text-ok border-ok/30 flex min-h-touch items-center justify-center gap-2 rounded-base border px-3 py-3 font-semibold shadow-sm">
            <Banknote aria-hidden="true" className="size-5" />
            Cash
          </div>
        </section>

        <dl className="border-border bg-surface-sunken space-y-1 rounded-base border p-3 text-sm">
          <Row
            label={totals.taxLines.length === 0 ? 'Subtotal' : 'Subtotal (ex tax)'}
            value={<Money value={totals.taxableBase} />}
          />
          {totals.taxLines.map((line, index) => (
            <Row
              key={`${line.paymentMethodScope}-${index}`}
              label={`Sales tax @ ${formatRate(line.rateBps)}`}
              value={<Money value={line.amount} />}
            />
          ))}
          {totals.posFee !== 0n && (
            <Row label="POS service fee" value={<Money value={totals.posFee} />} />
          )}
          <div className="border-border mt-2 flex items-baseline justify-between border-t pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd>
              <Money value={totals.grandTotal} symbol="Rs." emphasis="strong" />
            </dd>
          </div>
        </dl>
      </div>
    </Sheet>
  );
}

function Row({ label, value }: { readonly label: string; readonly value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-ink-muted">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
