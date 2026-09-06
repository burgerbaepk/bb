'use client';

import { useState } from 'react';
import { ChefHat, ReceiptText, Stamp } from 'lucide-react';
import { SegmentedControl } from '@natech/ui';
import type { Totals } from '@natech/domain';
import { priceLines } from '@natech/domain';
import type { BrandConfig } from '@natech/branding';
import { toDomainLines, type Invoice, type Order, type OutletConfig } from '@natech/contracts';
import { BillPreviewReceipt } from '@/components/receipt/BillPreviewReceipt';
import { KitchenOrderTicket } from '@/components/receipt/KitchenOrderTicket';
import { TaxInvoiceReceipt } from '@/components/receipt/TaxInvoiceReceipt';

/**
 * The three documents this outlet prints, side by side with the settings that
 * shape them — BUILD-PLAN.md §12, §14.3, §14.4.
 *
 * §12 requires that a customer never mistake a bill preview for a fiscal
 * receipt and that an inspector never does either. That is a property of the
 * printed artefacts as a set, not of any one of them, and up to now the only
 * way to check it was to ring a sale through on a real till with real paper.
 * A manager who changes the paper width from 80mm to 58mm needs to see what it
 * does to the item table before the queue does.
 *
 * The order matches the order a sale actually produces them in: kitchen ticket
 * when the order is sent, bill preview if the customer asks what they owe, tax
 * invoice at finalize. Only the last of the three carries the invoice number
 * and the QR, because only the last of the three is a fiscal document (R17's
 * successor under ADR 0019 — there is no printed check left to mark, so the
 * distinction now rests entirely on the tax invoice being the only numbered,
 * QR-bearing document in the set).
 */
export interface ReceiptPreviewProps {
  readonly outlet: OutletConfig;
  /** The most recent real invoice and its order, or null before the first sale. */
  readonly latest: { readonly invoice: Invoice; readonly order: Order } | null;
  readonly storefrontUrl: string | null;
  /** Live from the form above, so the preview moves as the manager types. */
  readonly widthMm: 58 | 80;
  readonly showUrdu: boolean;
  readonly headerLines: readonly string[];
  readonly footerLines: readonly string[];
  readonly paymentDetails: BrandConfig['receipt']['paymentDetails'];
}

type DocumentKey = 'KOT' | 'BILL' | 'INVOICE';

const DOCUMENTS: ReadonlyArray<{ readonly value: DocumentKey; readonly label: string }> = [
  { value: 'KOT', label: 'Kitchen ticket' },
  { value: 'BILL', label: 'Bill preview' },
  { value: 'INVOICE', label: 'Tax invoice' },
];

const NOTES: Record<DocumentKey, { readonly icon: typeof ChefHat; readonly note: string }> = {
  KOT: {
    icon: ChefHat,
    note: 'Printed when the order is sent. Carries no money and no tax — it is a production instruction, not a document the customer ever sees.',
  },
  BILL: {
    icon: ReceiptText,
    note: 'Optional, printed only if the customer asks what they owe before paying. Marked NOT FINAL, carries no invoice number and no QR, and is never a tax invoice (ADR 0019).',
  },
  INVOICE: {
    icon: Stamp,
    note: 'The one fiscal document. Printed at finalize with its allocated invoice number and the ordering QR. Gap-free and never reused (§5.8).',
  },
};

/**
 * Rebuild the engine's `Totals` from the settled invoice.
 *
 * The bill preview takes `Totals` because on a live till it is rendered before
 * an invoice exists. Here the invoice already exists and is authoritative, so
 * the figures are copied off it rather than recomputed — re-running the engine
 * against today's tax rules would show a bill that disagrees with the invoice
 * printed beside it the moment a rate changes (§6.12: the rules are frozen at
 * finalize).
 */
function totalsFromInvoice(invoice: Invoice, order: Order): Totals {
  return {
    subtotal: invoice.subtotal,
    discountTotal: invoice.discountTotal,
    taxableBase: invoice.taxableBase,
    taxTotal: invoice.taxTotal,
    ...(invoice.deliveryCharge === undefined ? {} : { deliveryCharge: invoice.deliveryCharge }),
    serviceCharge: invoice.serviceCharge,
    posFee: invoice.posFee,
    roundingAdj: invoice.roundingAdj,
    grandTotal: invoice.grandTotal,
    taxLines: invoice.taxLines.map((line) => ({
      taxClass: line.taxClass,
      rateBps: line.rateBps,
      base: line.base,
      amount: line.amount,
      paymentMethodScope: line.paymentMethodScope,
    })),
    pricedLines: priceLines(toDomainLines(order)),
  };
}

export function ReceiptPreview({
  outlet,
  latest,
  storefrontUrl,
  widthMm,
  showUrdu,
  headerLines,
  footerLines,
  paymentDetails,
}: ReceiptPreviewProps) {
  const [shown, setShown] = useState<DocumentKey>('INVOICE');

  if (latest === null) {
    return (
      <section className="border-border bg-surface-raised rounded-base border p-4">
        <h2 className="mb-1 font-semibold">Preview</h2>
        <p className="text-ink-muted text-sm">
          Previews are rendered from the most recent real invoice, so there is nothing to show until
          the first sale is finalized. Settings saved here apply to every document printed after
          them.
        </p>
      </section>
    );
  }

  const { invoice, order } = latest;
  const { icon: Icon, note } = NOTES[shown];

  return (
    <section className="border-border bg-surface-raised rounded-base border p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Preview</h2>
          <p className="text-ink-muted mt-1 text-sm">
            Rendered live from invoice {invoice.localNo} — a real finalized sale, at the paper width
            and content set above.
          </p>
        </div>
        <SegmentedControl
          label="Document to preview"
          value={shown}
          onChange={setShown}
          options={DOCUMENTS}
        />
      </div>

      <p className="text-ink-muted mb-3 flex items-start gap-2 text-sm">
        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {note}
      </p>

      {/* The receipt components render at a physical paper width in millimetres
          and assume black on white, because they are built for a thermal
          printer rather than for this screen. The white ground is therefore
          not decoration — it is what the paper is, and it must not follow the
          back office into dark mode. */}
      <div className="bg-surface-sunken overflow-x-auto rounded-base p-4">
        <div data-testid="receipt-paper" className="mx-auto w-fit bg-white text-black shadow-sm">
          {shown === 'KOT' && (
            <KitchenOrderTicket
              outlet={outlet}
              order={order}
              printedAt={invoice.finalizedAt}
              widthMm={widthMm}
              showUrdu={showUrdu}
            />
          )}
          {shown === 'BILL' && (
            <BillPreviewReceipt
              outlet={outlet}
              order={order}
              totals={totalsFromInvoice(invoice, order)}
              paymentMethod={invoice.payments[0]?.method ?? 'CASH'}
              widthMm={widthMm}
              showUrdu={showUrdu}
              operatorHeaderLines={headerLines}
              operatorFooterLines={footerLines}
              paymentDetails={paymentDetails}
            />
          )}
          {shown === 'INVOICE' && (
            <TaxInvoiceReceipt
              outlet={outlet}
              order={order}
              invoice={invoice}
              storefrontUrl={storefrontUrl}
              widthMm={widthMm}
              showUrdu={showUrdu}
              operatorHeaderLines={headerLines}
              operatorFooterLines={footerLines}
              paymentDetails={paymentDetails}
            />
          )}
        </div>
      </div>
    </section>
  );
}
