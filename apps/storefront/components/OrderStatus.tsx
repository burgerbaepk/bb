'use client';

import { BadgeCheck, Check, Clock, Info, XCircle } from 'lucide-react';
import { Money, StatusPill } from '@natech/ui';
import { useTranslations } from 'next-intl';
import type { PublicOrderStatus } from '@natech/contracts';
import { usePick } from './i18n';

/**
 * `/order/[publicId]` — BUILD-PLAN.md §13.1, §13.2, §13.4.
 *
 * The pending state is the important one. §13.4 forbids auto-accepting a web
 * order, so between placing and preparation there is a real interval where a
 * human has not yet looked. Saying "waiting for staff to accept" rather than
 * showing a spinner is the difference between a customer who waits and a
 * customer who walks to the counter.
 *
 * A rejection states its reason, because the alternative is a customer sitting
 * at a table waiting for food nobody is making.
 *
 * The subtotal is ex tax and there is no total (§13.2). Payment happens at the
 * counter, and the tax invoice handed over there is the first and only document
 * with a total on it — ADR 0019 removed the pre-payment check outright, and
 * this screen was still promising customers one.
 *
 * `status` is read alongside `decision`, not instead of it. `decision` collapses
 * everything past `PLACED` into ACCEPTED, so an order that had been served,
 * paid for and closed still read "Accepted" under a notice telling the customer
 * to go and pay — for as long as they left the page open.
 */
export function OrderStatus({ order }: { readonly order: PublicOrderStatus }) {
  const t = useTranslations();
  const pick = usePick();

  const settled = order.status === 'FINALIZED';
  const tone =
    order.decision === 'REJECTED' ? 'danger' : order.decision === 'PENDING' ? 'warn' : 'ok';
  const icon =
    order.decision === 'REJECTED'
      ? XCircle
      : order.decision === 'PENDING'
        ? Clock
        : settled
          ? BadgeCheck
          : Check;
  const label =
    order.decision === 'REJECTED'
      ? t('status.rejected')
      : order.decision === 'PENDING'
        ? t('status.pending')
        : settled
          ? t('status.completed')
          : t('status.accepted');

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="text-2xl font-semibold">{t('status.title')}</h1>
      <p className="text-ink-muted mt-1 text-sm tabular-nums">
        #{order.orderNo}
        {order.tableCode !== null && ` · ${t('cart.table')} ${order.tableCode}`}
      </p>

      <div className="mt-4">
        <StatusPill tone={tone} icon={icon} label={label} />
      </div>

      {order.rejectReason !== null && (
        <p className="border-danger bg-danger-soft text-danger mt-3 rounded-base border p-3 text-sm">
          {order.rejectReason}
        </p>
      )}

      {order.lines.length > 0 && (
        <>
          <ul className="divide-border mt-6 divide-y">
            {order.lines.map((line, index) => (
              <li key={`${line.name}-${index}`} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1 font-medium">
                  <span className="tabular-nums">{line.qtyLabel}</span>{' '}
                  {pick(line.name, line.nameUr)}
                </span>

                <Money value={line.lineTotalExTax} />
              </li>
            ))}
          </ul>

          <div className="border-border mt-4 flex items-baseline justify-between border-t pt-3">
            <span className="font-medium">{t('cart.subtotal')}</span>
            <Money value={order.subtotalExTax} symbol="Rs." emphasis="strong" />
          </div>
        </>
      )}

      {/* §13.2, §6.9 — no total here; the tax invoice at the counter carries it.
          A rejected order has nothing to pay for, and a settled one has already
          been paid, so neither gets told to go to the counter. */}
      {order.decision !== 'REJECTED' && (
        <p className="border-info bg-info-soft text-info mt-4 flex items-start gap-2 rounded-base border p-3 text-sm">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {settled ? t('status.settled') : t('status.payAtCounter')}
        </p>
      )}
    </div>
  );
}
