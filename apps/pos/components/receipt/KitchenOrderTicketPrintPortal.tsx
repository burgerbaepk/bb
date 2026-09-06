'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { KitchenOrderTicket, type KitchenOrderTicketProps } from './KitchenOrderTicket';

export interface KitchenOrderTicketPrintPortalProps extends KitchenOrderTicketProps {
  readonly onDone: () => void;
}

export function KitchenOrderTicketPrintPortal(props: KitchenOrderTicketPrintPortalProps) {
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
    <div id="kitchen-ticket-print-root">
      <style>{`
        @media screen { #kitchen-ticket-print-root { display: none; } }
        @media print {
          body > *:not(#kitchen-ticket-print-root) { display: none !important; }
          #kitchen-ticket-print-root { display: block !important; }
        }
      `}</style>
      <KitchenOrderTicket {...props} />
    </div>,
    document.body,
  );
}
