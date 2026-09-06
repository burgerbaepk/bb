'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { BrandConfig } from '@natech/branding';
import type { Invoice, Order, OutletConfig } from '@natech/contracts';
import { TaxInvoiceReceipt } from './TaxInvoiceReceipt';

/** §12 path 3 for the tax invoice — a portal rendering the receipt into an off-screen node and firing `window.print()` for the HTML print-dialog path. */
export interface TaxInvoicePrintPortalProps {
  readonly storefrontUrl?: string | null | undefined;
  readonly outlet: OutletConfig;
  readonly order: Order;
  readonly invoice: Invoice;
  readonly showUrdu?: boolean | undefined;
  readonly widthMm?: 58 | 80 | undefined;
  readonly headerLines?: readonly string[] | undefined;
  readonly footerLines?: readonly string[] | undefined;
  readonly paymentDetails?: BrandConfig['receipt']['paymentDetails'] | undefined;
  /** §8 — an invoice finalized while the terminal was offline. */
  readonly offline?: boolean | undefined;
  readonly onDone: () => void;
}

export function TaxInvoicePrintPortal({
  outlet,
  storefrontUrl,
  order,
  invoice,
  showUrdu = false,
  widthMm = 80,
  headerLines = [],
  footerLines = [],
  paymentDetails,
  offline = false,
  onDone,
}: TaxInvoicePrintPortalProps) {
  useEffect(() => {
    const timer = window.setTimeout(() => window.print(), 150);
    window.addEventListener('afterprint', onDone);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', onDone);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div id="tax-invoice-print-root">
      <style>{`
        @media screen {
          #tax-invoice-print-root { display: none; }
        }
        @media print {
          body > *:not(#tax-invoice-print-root) { display: none !important; }
          #tax-invoice-print-root { display: block !important; }
        }
      `}</style>
      <TaxInvoiceReceipt
        outlet={outlet}
        storefrontUrl={storefrontUrl}
        order={order}
        invoice={invoice}
        showUrdu={showUrdu}
        widthMm={widthMm}
        operatorHeaderLines={headerLines}
        operatorFooterLines={footerLines}
        paymentDetails={paymentDetails}
        offline={offline}
      />
    </div>,
    document.body,
  );
}
