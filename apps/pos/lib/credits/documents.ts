import 'server-only';
import { formatPaisa } from '@natech/ui';
import type { EscPosDocument, EscPosLine } from '@natech/print-bridge/escpos';
import type { CreditNote, OutletConfig } from '@natech/contracts';
import { formatDateTime } from '@/components/lib/format';

/**
 * The credit note ESC/POS document — BUILD-PLAN.md §7.1, §7.3 `invoiceType:
 * 4`, defect K2. Mirrors `invoiceEscPosDocument`'s shape
 * (`apps/pos/lib/printing/documents.ts`) — same header, same R17-adjacent
 * PRA/FBR marking and pending banner — for the document that reverses one.
 */
function money(paisa: bigint): string {
  return formatPaisa(paisa, { symbol: 'Rs.' });
}

function rule(): EscPosLine {
  return { text: '-'.repeat(32) };
}

export function creditNoteEscPosDocument(
  outlet: OutletConfig,
  creditNote: CreditNote,
): EscPosDocument {
  const lines: EscPosLine[] = [
    { text: outlet.tradingName, align: 'center', bold: true },
    { text: outlet.address, align: 'center' },
    ...(outlet.ntn.trim() === ''
      ? []
      : ([{ text: `NTN ${outlet.ntn}`, align: 'center' as const }] satisfies EscPosLine[])),
    rule(),
    { text: 'CREDIT NOTE', align: 'center', bold: true },
    rule(),
    { text: `Reverses invoice ${creditNote.invoiceLocalNo}` },
    { text: formatDateTime(creditNote.issuedAt, outlet.timezone) },
    { text: `Reason: ${creditNote.reason}` },
    rule(),
    { text: `AMOUNT  ${money(creditNote.amount)}`, bold: true },
    rule(),
  ];

  return { lines };
}
