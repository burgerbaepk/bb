'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { CreditNote, OutletConfig } from '@natech/contracts';
import { CreditNoteReceipt } from './CreditNoteReceipt';

/** §12 path 3 for the credit note — mirrors `TaxInvoicePrintPortal`'s identical shape, the other document. */
export interface CreditNotePrintPortalProps {
  readonly outlet: OutletConfig;
  readonly creditNote: CreditNote;
  readonly onDone: () => void;
}

export function CreditNotePrintPortal({ outlet, creditNote, onDone }: CreditNotePrintPortalProps) {
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
    <div id="credit-note-print-root">
      <style>{`
        @media screen {
          #credit-note-print-root { display: none; }
        }
        @media print {
          body > *:not(#credit-note-print-root) { display: none !important; }
          #credit-note-print-root { display: block !important; }
        }
      `}</style>
      <CreditNoteReceipt outlet={outlet} creditNote={creditNote} />
    </div>,
    document.body,
  );
}
