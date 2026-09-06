'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { Button, Money } from '@natech/ui';
import type { BrandConfig } from '@natech/branding';
import type { Invoice, Order, OutletConfig } from '@natech/contracts';
import { TaxInvoiceReceipt } from '@/components/receipt/TaxInvoiceReceipt';
import { formatBusinessDate, formatDateTime } from '@/components/lib/format';
import { recordInvoiceReprintAction } from '@/lib/invoices/actions';

export function InvoiceDetail({
  invoice,
  order,
  outlet,
  receipt,
  storefrontUrl,
}: {
  readonly invoice: Invoice;
  readonly order: Order;
  readonly outlet: OutletConfig;
  readonly storefrontUrl?: string | null | undefined;
  readonly receipt: BrandConfig['receipt'];
}) {
  const [printing, setPrinting] = useState(false);
  const reprint = async () => {
    setPrinting(true);
    const result = await recordInvoiceReprintAction(invoice.id);
    setPrinting(false);
    if (!result.ok) return window.alert(result.error ?? 'Could not record reprint.');
    window.print();
  };
  return (
    <>
      <div className="no-print mb-5 flex flex-wrap items-start gap-3">
        <Link
          className="border-border rounded-base border p-2"
          href="/admin/invoices"
          aria-label="Back to invoices"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">{invoice.localNo}</h1>
          <p className="text-ink-muted text-sm">
            Finalized {formatDateTime(invoice.finalizedAt, outlet.timezone)} · business date{' '}
            {formatBusinessDate(invoice.businessDate)}
          </p>
        </div>
        <Button icon={Printer} tone="primary" onClick={() => void reprint()} disabled={printing}>
          {printing ? 'Preparing…' : 'Reprint invoice'}
        </Button>
      </div>
      <div className="no-print mb-5 grid gap-4 lg:grid-cols-3">
        <section className="border-border bg-surface-raised rounded-base border p-4">
          <h2 className="mb-2 font-semibold">Invoice record</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>Order</dt>
              <dd>#{order.orderNo}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Status</dt>
              <dd>{invoice.status}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Terminal</dt>
              <dd>{invoice.terminalLabel ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Finalized by</dt>
              <dd>{invoice.finalizedByName ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Prior prints</dt>
              <dd>{invoice.printedCount}</dd>
            </div>
          </dl>
        </section>
        <section className="border-border bg-surface-raised rounded-base border p-4">
          <h2 className="mb-2 font-semibold">Payment</h2>
          {invoice.payments.map((payment) => (
            <div key={payment.id} className="flex justify-between text-sm">
              <span>
                {payment.method}
                {payment.cardLast4 ? ` · •••• ${payment.cardLast4}` : ''}
              </span>
              <Money value={payment.amount} />
            </div>
          ))}
        </section>
      </div>
      <div id="invoice-print-area">
        <TaxInvoiceReceipt
          storefrontUrl={storefrontUrl}
          outlet={outlet}
          order={order}
          invoice={invoice}
          widthMm={receipt.widthMm}
          showUrdu={receipt.showUrdu}
          operatorHeaderLines={receipt.headerLines}
          operatorFooterLines={receipt.footerLines}
          paymentDetails={receipt.paymentDetails}
        />
      </div>
      <style>{`@media print { body > * { visibility: hidden; } #invoice-print-area, #invoice-print-area * { visibility: visible; } #invoice-print-area { position: absolute; inset: 0; } .no-print { display: none !important; } }`}</style>
    </>
  );
}
