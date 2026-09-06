'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Totals } from '@natech/domain';
import type { BrandConfig } from '@natech/branding';
import type { Order, OutletConfig, PaymentMethod } from '@natech/contracts';
import { BillPreviewReceipt } from './BillPreviewReceipt';

export interface BillPreviewPrintPortalProps {
  readonly outlet: OutletConfig;
  readonly order: Order;
  readonly totals: Totals;
  readonly paymentMethod: PaymentMethod;
  readonly widthMm: 58 | 80;
  readonly showUrdu: boolean;
  readonly headerLines: readonly string[];
  readonly footerLines: readonly string[];
  readonly paymentDetails: BrandConfig['receipt']['paymentDetails'];
  readonly onDone: () => void;
}

export function BillPreviewPrintPortal(props: BillPreviewPrintPortalProps) {
  useEffect(() => {
    const timer = window.setTimeout(() => window.print(), 150);
    window.addEventListener('afterprint', props.onDone);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', props.onDone);
    };
    // The portal represents one print request and is remounted for the next one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div id="bill-preview-print-root">
      <style>{`
        @media screen { #bill-preview-print-root { display: none; } }
        @media print {
          body > *:not(#bill-preview-print-root) { display: none !important; }
          #bill-preview-print-root { display: block !important; }
        }
      `}</style>
      <BillPreviewReceipt
        outlet={props.outlet}
        order={props.order}
        totals={props.totals}
        paymentMethod={props.paymentMethod}
        widthMm={props.widthMm}
        showUrdu={props.showUrdu}
        operatorHeaderLines={props.headerLines}
        operatorFooterLines={props.footerLines}
        paymentDetails={props.paymentDetails}
      />
    </div>,
    document.body,
  );
}
