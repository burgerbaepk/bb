'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Clock, Globe, MapPin, Phone, X } from 'lucide-react';
import {
  Button,
  Dialog,
  EmptyState,
  Money,
  SegmentedControl,
  SelectField,
  StatusPill,
  useToast,
} from '@natech/ui';
import { formatPhone, paisa } from '@natech/domain';
import type { WebOrder } from '@natech/contracts';
import { formatDateTime } from '@/components/lib/format';
import { acceptWebOrderAction, rejectWebOrderAction } from '@/lib/webOrders/actions';
import { useWebOrdersRealtime } from '@/lib/realtime/useWebOrdersRealtime';

/**
 * The web-order inbox — BUILD-PLAN.md §13.4, §16, R16.
 *
 * §13.4 ends with a one-line rule that shapes this whole screen: **never
 * auto-accept a web order**. Silently accepting an order the floor cannot
 * actually fulfil produces a customer sitting at a table waiting for food
 * nobody started, and the storefront has no way to know.
 *
 * So every order arrives `PENDING` and waits for a human. Rejecting takes a
 * reason, because the customer watching `/order/[publicId]` is shown it.
 *
 * The header count and value derive from the rows rendered (R16).
 */
const REJECT_REASONS = [
  { value: '', label: 'Choose a reason' },
  { value: 'At capacity', label: 'At capacity' },
  { value: 'Item unavailable', label: 'Item unavailable' },
  { value: 'Closing soon', label: 'Closing soon' },
  { value: 'Table already settled', label: 'Table already settled' },
];

const POLL_INTERVAL_MS = 3_000;

export interface WebOrderInboxProps {
  readonly orders: readonly WebOrder[];
  readonly timezone: string;
}

export function WebOrderInbox({ orders, timezone }: WebOrderInboxProps) {
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<WebOrder['decision'] | 'ALL'>('PENDING');
  const [rejecting, setRejecting] = useState<WebOrder | null>(null);
  const [reason, setReason] = useState('');
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  // §16 — reconcile against a full fetch on every signal; `router.refresh()`
  // re-runs this page's server component with fresh `readWebOrders()` data.
  //
  // The three-second poll is the half §16 requires and this screen was built
  // without: "poll every 3 seconds as a correctness backstop on every
  // consumer". An `EventSource` drops — a sleeping tablet, a recycled
  // serverless function, a proxy idle timeout — and it reconnects without
  // telling anyone, so the inbox that was missing the backstop was the one
  // surface where a QR order could sit unseen until a human reloaded the page.
  // `ActiveOrdersTray` and `FloorPlan` have both had this from M09b.
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [router]);
  useWebOrdersRealtime(() => router.refresh());

  async function accept(order: WebOrder): Promise<void> {
    setBusyOrderId(order.orderId);
    try {
      const result = await acceptWebOrderAction({ orderId: order.orderId });
      if (result.ok) {
        toast.show('success', `Order ${order.orderNo} accepted`);
        router.refresh();
      } else {
        toast.show('error', result.error ?? 'Could not accept that order.');
      }
    } finally {
      setBusyOrderId(null);
    }
  }

  async function reject(order: WebOrder, rejectReason: string): Promise<void> {
    setBusyOrderId(order.orderId);
    try {
      const result = await rejectWebOrderAction({ orderId: order.orderId, reason: rejectReason });
      if (result.ok) {
        toast.show('info', `Order ${order.orderNo} rejected — ${rejectReason}`);
        setRejecting(null);
        router.refresh();
      } else {
        toast.show('error', result.error ?? 'Could not reject that order.');
      }
    } finally {
      setBusyOrderId(null);
    }
  }

  const visible = orders.filter((order) => filter === 'ALL' || order.decision === filter);
  const headerValue = paisa(visible.reduce((total, order) => total + order.subtotalExTax, 0n));

  return (
    <div className="flex h-full flex-col">
      <div className="border-border space-y-2 border-b px-4 py-3">
        <SegmentedControl
          label="Filter web orders"
          value={filter}
          onChange={setFilter}
          options={[
            {
              value: 'PENDING' as const,
              label: 'Waiting',
              count: orders.filter((order) => order.decision === 'PENDING').length,
            },
            {
              value: 'ACCEPTED' as const,
              label: 'Accepted',
              count: orders.filter((order) => order.decision === 'ACCEPTED').length,
            },
            {
              value: 'REJECTED' as const,
              label: 'Rejected',
              count: orders.filter((order) => order.decision === 'REJECTED').length,
            },
            { value: 'ALL' as const, label: 'All', count: orders.length },
          ]}
        />
        <p className="text-ink-muted text-sm">
          <span className="text-ink font-semibold tabular-nums">{visible.length}</span> orders ·{' '}
          <Money value={headerValue} symbol="Rs." emphasis="strong" /> subtotal (ex tax)
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {visible.length === 0 ? (
          <EmptyState
            icon={Globe}
            title="Nothing waiting"
            description="Orders placed from the QR menu land here. They are never accepted automatically."
          />
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {visible.map((order) => (
              <li
                key={order.orderId}
                className="border-border bg-surface-raised space-y-2 rounded-base border p-4"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <h3 className="font-semibold">Order #{order.orderNo}</h3>
                  <StatusPill
                    size="sm"
                    icon={
                      order.decision === 'PENDING'
                        ? Clock
                        : order.decision === 'ACCEPTED'
                          ? Check
                          : X
                    }
                    tone={
                      order.decision === 'PENDING'
                        ? 'warn'
                        : order.decision === 'ACCEPTED'
                          ? 'ok'
                          : 'danger'
                    }
                    label={
                      order.decision === 'PENDING'
                        ? 'Waiting for staff'
                        : order.decision === 'ACCEPTED'
                          ? 'Accepted'
                          : 'Rejected'
                    }
                  />
                  <span className="text-ink-subtle ms-auto text-xs">
                    {formatDateTime(order.placedAt, timezone)}
                  </span>
                </div>

                <p className="text-ink-muted text-sm">
                  {order.customerName} · {order.customerEmail}
                  {order.tableCode !== null && ` · Table ${order.tableCode}`}
                </p>

                {/* ADR 0022 — the phone is a `tel:` link because the reason it
                    is on this card is that somebody is about to ring it, and a
                    till is as often a tablet as a desktop. It reads grouped and
                    stores canonical (`canonicalPhone`), so the number dialled
                    is the number saved. */}
                {order.customerPhone !== null && (
                  <p className="flex items-center gap-1.5 text-sm">
                    <Phone aria-hidden="true" className="text-ink-subtle size-3.5 shrink-0" />
                    <a
                      href={`tel:${order.customerPhone}`}
                      className="font-medium tabular-nums underline underline-offset-4"
                    >
                      {formatPhone(order.customerPhone)}
                    </a>
                  </p>
                )}

                {/* Only where it is load-bearing. A dine-in order has a table
                    number; printing a home address on it is noise on a card
                    staff are reading under time pressure. */}
                {order.tableCode === null && order.customerAddress !== null && (
                  <p className="text-ink-muted flex items-start gap-1.5 text-sm">
                    <MapPin
                      aria-hidden="true"
                      className="text-ink-subtle mt-0.5 size-3.5 shrink-0"
                    />
                    {order.customerAddress}
                  </p>
                )}

                {order.lines.length > 0 && (
                  <ul className="text-sm">
                    {order.lines.map((line) => (
                      <li key={line.id} className="flex justify-between gap-2">
                        <span>
                          {line.qty / 1000n}× {line.nameSnapshot}
                        </span>
                        <Money value={line.unitPrice} />
                      </li>
                    ))}
                  </ul>
                )}

                {order.note !== null && (
                  <p className="text-warn text-sm font-medium">Note: {order.note}</p>
                )}

                {order.rejectReason !== null && (
                  <p className="text-danger text-sm">Rejected — {order.rejectReason}</p>
                )}

                <div className="border-border flex items-baseline justify-between border-t pt-2">
                  <span className="text-ink-muted text-sm">Subtotal (ex tax)</span>
                  <Money value={order.subtotalExTax} symbol="Rs." emphasis="strong" />
                </div>

                {order.decision === 'PENDING' && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      tone="primary"
                      icon={Check}
                      disabled={busyOrderId === order.orderId}
                      onClick={() => void accept(order)}
                    >
                      Accept
                    </Button>
                    <Button
                      tone="danger"
                      icon={X}
                      disabled={busyOrderId === order.orderId}
                      onClick={() => {
                        setRejecting(order);
                        setReason('');
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={rejecting !== null}
        onClose={() => setRejecting(null)}
        title="Reject this order"
        description="The customer sees the reason on their order status page."
        footer={
          <>
            <Button onClick={() => setRejecting(null)}>Cancel</Button>
            <Button
              tone="danger"
              disabled={reason === '' || rejecting === null || busyOrderId === rejecting.orderId}
              onClick={() => {
                if (rejecting !== null) void reject(rejecting, reason);
              }}
            >
              Reject order
            </Button>
          </>
        }
      >
        <SelectField
          label="Reason"
          help="Shown to the customer and recorded against this order."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          options={REJECT_REASONS}
          required
        />
      </Dialog>
    </div>
  );
}
