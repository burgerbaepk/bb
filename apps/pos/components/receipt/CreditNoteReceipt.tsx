import { Money } from '@natech/ui';
import type { CreditNote, OutletConfig } from '@natech/contracts';
import { formatDateTime } from '@/components/lib/format';
import { ReceiptFrame, ReceiptRow, ReceiptRule } from './ReceiptFrame';

/**
 * The credit note — BUILD-PLAN.md §7.1, §7.3 `invoiceType: 4`, defect K2.
 *
 * Mirrors `TaxInvoiceReceipt.tsx`'s PRA/FBR marking and pending-banner
 * treatment for the document that reverses one. `CreditNoteSchema` carries
 * no line items (§7's own shape — a full reversal names the invoice it
 * reverses and an amount, not a re-itemised cart), so this receipt is
 * shorter than the invoice it corrects.
 */
export interface CreditNoteReceiptProps {
  readonly outlet: OutletConfig;
  readonly creditNote: CreditNote;
  readonly widthMm?: 58 | 80 | undefined;
}

export function CreditNoteReceipt({ outlet, creditNote, widthMm = 80 }: CreditNoteReceiptProps) {
  return (
    <ReceiptFrame outlet={outlet} widthMm={widthMm}>
      <ReceiptRule />
      <div className="text-center">
        <p className="text-base font-semibold tracking-[0.2em]">CREDIT NOTE</p>
      </div>
      <ReceiptRule />

      <div className="flex justify-between">
        <span>Reverses invoice</span>
        <span>{creditNote.invoiceLocalNo}</span>
      </div>
      <div className="flex justify-between">
        <span>{formatDateTime(creditNote.issuedAt, outlet.timezone)}</span>
        <span>{creditNote.issuedByName ?? '—'}</span>
      </div>
      <p>Reason: {creditNote.reason}</p>

      <ReceiptRule />
      <ReceiptRow
        label="AMOUNT"
        value={<Money value={creditNote.amount} symbol="Rs." emphasis="strong" />}
        strong
      />
      <ReceiptRule />
    </ReceiptFrame>
  );
}
