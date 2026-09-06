'use client';

import { useState } from 'react';
import { Banknote, CreditCard, MapPin, ReceiptText, Trash2, UserRound } from 'lucide-react';
import { Button, Duration, IconButton, Money, cn } from '@natech/ui';
import type { TrayOrder } from '@natech/contracts';
import { formatRate } from '@/components/lib/format';

/**
 * A booked-order card — BUILD-PLAN.md §11.3, defect V4.
 *
 * Exactly two actions, by explicit product decision (2026-08-27): `Load
 * order` pulls the whole order back into the POS screen for editing —
 * nothing here fires a payment step, that all happens from the main screen
 * once the order is loaded — and a directly visible
 * void icon sits beside it. Putting void one tap away is the same place the
 * system this replaces puts it (defect V4's "mis-tap away from destroying an
 * order mid-service"), but the guard V4 was actually about still holds: the
 * icon only opens `VoidOrderDialog`, and `voidOrderAction` refuses the
 * mutation server-side without the `order.void` permission
 * regardless of how the dialog was reached — so a mis-tap opens a form, not
 * a destroyed order.
 */
export interface OrderCardProps {
  readonly order: TrayOrder;
  readonly compact: boolean;
  readonly onLoad: (order: TrayOrder) => void;
  readonly onDelete: (order: TrayOrder) => void;
}

export function OrderCard({ order, compact, onLoad, onDelete }: OrderCardProps) {
  const [paymentMethod, setPaymentMethod] = useState<'CARD' | 'CASH'>('CARD');
  const breakdown =
    order.paymentBreakdowns.find((option) => option.method === paymentMethod) ?? null;

  return (
    <article
      className={cn(
        'border-border bg-surface-raised group flex h-full flex-col overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-md',
        compact && 'text-sm',
      )}
    >
      <header className={cn('border-border bg-surface-sunken border-b', compact ? 'p-3' : 'p-4')}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold">
                {order.tableCode === null ? `Order #${order.orderNo}` : `Table ${order.tableCode}`}
              </h3>
              <span className="bg-surface-raised border-border rounded-full border px-2 py-0.5 text-2xs font-semibold tracking-wide uppercase">
                {order.status}
              </span>
            </div>
            <p className="text-ink-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span>Order #{order.orderNo}</span>
              <span>{order.type.replace('_', ' ')}</span>
              {order.zoneName !== null && (
                <span className="inline-flex items-center gap-1">
                  <MapPin aria-hidden="true" className="size-3" /> {order.zoneName}
                </span>
              )}
            </p>
          </div>
          <span className="shrink-0">
            <Duration
              seconds={order.elapsedSeconds}
              thresholds={{ targetSeconds: 1800, overdueSeconds: 3600 }}
              label="Time since the order opened"
            />
          </span>
        </div>
      </header>

      <div className={cn('flex flex-1 flex-col gap-3', compact ? 'p-3' : 'p-4')}>
        <div className="text-ink-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <UserRound aria-hidden="true" className="size-4" />
            {order.customerName ?? 'Walk-in Customer'}
          </span>
          {order.guestCount !== null && <span>{order.guestCount} guests</span>}
          {order.waiterInitials !== null && <span>Waiter {order.waiterInitials}</span>}
        </div>

        {!compact && order.lineSummary.length > 0 && (
          <div className="border-border rounded-lg border p-3">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
              <ReceiptText aria-hidden="true" className="size-4" /> {order.itemCount} items
            </p>
            <p className="text-ink-muted line-clamp-2 text-sm leading-relaxed">
              {order.lineSummary.slice(0, 4).join(' · ')}
              {order.lineSummary.length > 4 && (
                <span className="text-ink-subtle"> +{order.lineSummary.length - 4} more</span>
              )}
            </p>
          </div>
        )}

        <section
          className="border-border bg-surface-sunken rounded-lg border p-3"
          aria-label="Payment breakdown"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold">Payment breakdown</h4>
            <div
              className="border-border bg-surface-raised grid grid-cols-2 rounded-lg border p-0.5"
              role="group"
              aria-label="Payment method"
            >
              {(['CARD', 'CASH'] as const).map((method) => {
                const Icon = method === 'CARD' ? CreditCard : Banknote;
                return (
                  <button
                    key={method}
                    type="button"
                    aria-pressed={paymentMethod === method}
                    onClick={() => setPaymentMethod(method)}
                    className={cn(
                      'min-h-8 rounded-md px-2.5 text-xs font-semibold transition-colors',
                      paymentMethod === method ? 'bg-ink text-surface-raised' : 'text-ink-muted',
                    )}
                  >
                    <Icon aria-hidden="true" className="me-1 inline size-3.5" />
                    {method === 'CARD' ? 'Card' : 'Cash'}
                  </button>
                );
              })}
            </div>
          </div>

          {breakdown === null ? (
            <p className="text-ink-muted text-sm">Payment totals are unavailable for this role.</p>
          ) : (
            <dl className="space-y-1.5 text-sm">
              <MoneyRow label="Subtotal (ex tax)" value={order.subtotalExTax} />
              {breakdown.discountTotal !== 0n && (
                <MoneyRow label="Discount" value={-breakdown.discountTotal} />
              )}
              <MoneyRow label="Taxable subtotal" value={breakdown.taxableBase} />
              {breakdown.taxRatesBps.length !== 0 && (
                <MoneyRow
                  label={`Sales tax @ ${breakdown.taxRatesBps.map(formatRate).join(' + ')}`}
                  value={breakdown.taxTotal}
                />
              )}
              {breakdown.deliveryCharge !== undefined && breakdown.deliveryCharge > 0n && (
                <MoneyRow label="Delivery charges" value={breakdown.deliveryCharge} />
              )}
              {breakdown.serviceCharge !== 0n && (
                <MoneyRow label="Service charge" value={breakdown.serviceCharge} />
              )}
              {breakdown.posFee !== 0n && (
                <MoneyRow label="POS service fee" value={breakdown.posFee} />
              )}
              {breakdown.roundingAdj !== 0n && (
                <MoneyRow label="Rounding" value={breakdown.roundingAdj} />
              )}
              <div className="border-border mt-2 flex items-end justify-between gap-3 border-t pt-2">
                <dt className="font-semibold">Amount due</dt>
                <dd>
                  <Money value={breakdown.grandTotal} symbol="Rs." emphasis="strong" />
                </dd>
              </div>
            </dl>
          )}
        </section>

        <footer className="mt-auto flex gap-2 pt-1">
          <Button block tone="primary" onClick={() => onLoad(order)} size={compact ? 'sm' : 'md'}>
            Load order
          </Button>
          <IconButton
            tone="danger"
            icon={Trash2}
            label={`Delete order ${order.orderNo}`}
            size={compact ? 'sm' : 'md'}
            onClick={() => onDelete(order)}
          />
        </footer>
      </div>
    </article>
  );
}

function MoneyRow({ label, value }: { readonly label: string; readonly value: bigint }) {
  return (
    <div className="text-ink-muted flex items-baseline justify-between gap-3">
      <dt>{label}</dt>
      <dd className="text-ink tabular-nums">
        <Money value={value} />
      </dd>
    </div>
  );
}
