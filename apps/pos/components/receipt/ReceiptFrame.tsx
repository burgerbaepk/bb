import { visibleReceiptLines } from '@/lib/printing/receiptText';
import type { ReactNode } from 'react';
import { cn } from '@natech/ui';
import type { BrandConfig } from '@natech/branding';
import { VENDOR_FOOTER_LINE, type OutletConfig } from '@natech/contracts';

/**
 * The 80mm paper. BUILD-PLAN.md §12, §14.3, §14.4.
 *
 * Shared by the check and the tax invoice so the two are the same object
 * physically and unmistakable visually. §12 requires that a customer never
 * mistake a check for a fiscal receipt and that an inspector never does either,
 * which is a job for the marking and the layout, not for two different paper
 * widths.
 *
 * The vendor line is rendered by the frame, beneath whatever the operator
 * configured, and cannot be removed from a caller (§14.4). The receipt this
 * product replaces prints a personal mobile number as the software vendor on
 * every fiscal document (defect K1).
 */
export interface ReceiptFrameProps {
  readonly outlet: OutletConfig;
  /** 58 or 80, from `receipt.widthMm` (§14.3). */
  readonly widthMm?: 58 | 80 | undefined;
  readonly operatorFooterLines?: readonly string[] | undefined;
  readonly operatorHeaderLines?: readonly string[] | undefined;
  readonly paymentDetails?: BrandConfig['receipt']['paymentDetails'] | undefined;
  readonly showTaxIdentity?: boolean;
  readonly children: ReactNode;
  readonly className?: string | undefined;
}

export function ReceiptRule() {
  return <div className="border-ink/40 my-1 border-t border-dashed" aria-hidden="true" />;
}

export function ReceiptRow({
  label,
  value,
  strong = false,
}: {
  readonly label: ReactNode;
  readonly value: ReactNode;
  readonly strong?: boolean | undefined;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-2', strong && 'font-semibold')}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function ReceiptFrame({
  outlet,
  widthMm = 80,
  operatorFooterLines = [],
  operatorHeaderLines = [],
  paymentDetails,
  children,
  showTaxIdentity = false,
  className,
}: ReceiptFrameProps) {
  return (
    <article
      data-receipt-width={widthMm}
      className={cn(
        'mx-auto border border-black bg-white p-2.5 font-mono text-xs leading-tight text-black',
        widthMm === 80 ? 'w-[22rem]' : 'w-[17rem]',
        className,
      )}
    >
      <header className="text-center">
        <p className="text-xl font-black tracking-tight uppercase">{outlet.tradingName}</p>
        <p>
          {outlet.address}, {outlet.city}
        </p>
        {showTaxIdentity && outlet.ntn.trim() !== '' && (
          <p className="font-semibold">NTN: {outlet.ntn}</p>
        )}
      </header>

      {operatorHeaderLines.length > 0 && (
        <div className="mt-1 text-center">
          {visibleReceiptLines(operatorHeaderLines, showTaxIdentity).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}

      {children}

      <footer className="mt-2 text-center">
        {paymentDetails !== undefined && Object.values(paymentDetails).some(Boolean) && (
          <div className="mb-2 border-t border-dashed border-black pt-2 text-start">
            {paymentDetails.bankName !== '' && (
              <p className="font-semibold">Bank: {paymentDetails.bankName}</p>
            )}
            {paymentDetails.iban !== '' && <p>IBAN: {paymentDetails.iban}</p>}
            {paymentDetails.accountNumber !== '' && (
              <p>Account No: {paymentDetails.accountNumber}</p>
            )}
            {paymentDetails.jazzCash !== '' && <p>JazzCash: {paymentDetails.jazzCash}</p>}
            {paymentDetails.easyPaisa !== '' && <p>EasyPaisa: {paymentDetails.easyPaisa}</p>}
          </div>
        )}
        {visibleReceiptLines(operatorFooterLines, showTaxIdentity).map((line) => (
          <p key={line}>{line}</p>
        ))}
        <p className="mt-1">{VENDOR_FOOTER_LINE}</p>
      </footer>
    </article>
  );
}
