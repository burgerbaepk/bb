import { visibleReceiptLines } from '@/lib/printing/receiptText';
import type { ReactNode } from 'react';
import { cn } from '@natech/ui';
import type { BrandConfig } from '@natech/branding';
import { priceLines, type Paisa } from '@natech/domain';
import {
  VENDOR_FOOTER_LINE,
  toDomainLines,
  type Order,
  type OutletConfig,
} from '@natech/contracts';
import { formatQty } from '@/components/lib/format';
import { ReceiptMoney } from './ReceiptMoney';

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
 *
 * ADR 0028 — the layout is set in the body sans at weights a thermal head
 * reproduces cleanly, and the blocks the bill preview and the tax invoice
 * share (title, order details, delivery address, items, total) live here so
 * the two documents cannot drift apart. Solid black is used twice only — the
 * document title and the total — which is what the eye should land on first;
 * `print-color-adjust: exact` is what stops the browser dropping those fills
 * as "background graphics" on the way to the printer.
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

const INK_EXACT = '[print-color-adjust:exact] [-webkit-print-color-adjust:exact]';

export function ReceiptRule() {
  return <div className="my-2 border-t border-dashed border-black" aria-hidden="true" />;
}

/** The document's name, reversed out of solid black, with its qualifier beneath. */
export function ReceiptTitle({
  title,
  subtitle,
}: {
  readonly title: string;
  readonly subtitle?: ReactNode;
}) {
  return (
    <div className="my-3 text-center">
      <p
        className={cn(
          'inline-block bg-black px-4 py-1 text-sm font-black tracking-[0.25em] text-white',
          INK_EXACT,
        )}
      >
        {title}
      </p>
      {subtitle !== undefined && (
        <div className="mt-1 text-[10px] font-bold tracking-[0.18em] uppercase">{subtitle}</div>
      )}
    </div>
  );
}

function MetaCell({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="px-2 py-1">
      <p className="text-[9px] font-bold tracking-[0.18em] uppercase">{label}</p>
      <p className="text-sm leading-tight font-black uppercase">{children}</p>
    </div>
  );
}

const ORDER_TYPE_TEXT: Record<Order['type'], string> = {
  DINE_IN: 'Dine-in',
  TAKE_AWAY: 'Takeaway',
  DELIVERY: 'Delivery',
};

/**
 * Type, payment, table, customer and — for a delivery — the address.
 *
 * ADR 0028 — the delivery address is the largest text on the paper after the
 * total, boxed, because the rider reads it off the bag at a gate in poor
 * light. The earlier receipt printed it as a regular-weight line under the
 * customer name, where it was the easiest thing on the bill to miss.
 */
export function ReceiptOrderDetails({
  order,
  paymentLabel,
}: {
  readonly order: Order;
  readonly paymentLabel: string;
}) {
  const address = order.type === 'DELIVERY' ? (order.deliveryAddress?.trim() ?? '') : '';
  return (
    <>
      <div className="grid grid-cols-2 divide-x divide-black border-y border-black">
        <MetaCell label="Order type">{ORDER_TYPE_TEXT[order.type]}</MetaCell>
        <MetaCell label="Payment">{paymentLabel}</MetaCell>
      </div>
      {order.type === 'DINE_IN' && (
        <div className="flex items-baseline justify-between border-b border-black px-2 py-1">
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase">Table</span>
          <span className="text-2xl font-black">{order.tableCode ?? '—'}</span>
        </div>
      )}
      <div className="mt-2 flex items-baseline justify-between gap-2 px-0.5">
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase">Customer</span>
        <span className="text-end text-sm font-bold uppercase">
          {order.customerName ?? 'Walk-in Customer'}
        </span>
      </div>
      {order.customerPhone !== null && address === '' && (
        <div className="flex items-baseline justify-between gap-2 px-0.5">
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase">Phone</span>
          <span className="text-sm font-bold tabular-nums">{order.customerPhone}</span>
        </div>
      )}
      {address !== '' && (
        <div className="mt-2 rounded-sm border-2 border-black px-2.5 py-2">
          <p className="text-[10px] font-black tracking-[0.2em] uppercase">Deliver to</p>
          <p className="mt-0.5 text-lg leading-snug font-black break-words whitespace-pre-wrap">
            {address}
          </p>
          {order.customerPhone !== null && (
            <p className="mt-1 text-base font-bold tabular-nums">Tel {order.customerPhone}</p>
          )}
        </div>
      )}
    </>
  );
}

/** Item, quantity and value, with the unit rate beneath the name. */
export function ReceiptItems({
  order,
  showUrdu,
}: {
  readonly order: Order;
  readonly showUrdu: boolean;
}) {
  const priced = priceLines(toDomainLines(order)).filter((line) => line.line.isVoid !== true);
  return (
    <table className="mt-3 w-full table-fixed border-collapse text-start">
      <thead>
        <tr className="border-y-2 border-black text-[10px] tracking-[0.18em] uppercase">
          <th className="w-[62%] py-1 ps-0.5 text-start font-black">Item</th>
          <th className="w-[12%] py-1 text-center font-black">Qty</th>
          <th className="w-[26%] py-1 pe-0.5 text-end font-black">Amount</th>
        </tr>
      </thead>
      <tbody>
        {priced.map((line) => (
          <tr key={line.line.id} className="border-b border-dashed border-black/60 align-top">
            <td className="py-1.5 ps-0.5 break-words">
              <p className="text-[13px] leading-tight font-bold">{line.line.name}</p>
              {/* §15.1 — the item's own name, not a static banner. */}
              {showUrdu && line.line.nameUr != null && (
                <p className="font-normal" lang="ur" dir="rtl">
                  {line.line.nameUr}
                </p>
              )}
              <p className="text-[10px] tabular-nums">
                @ <ReceiptMoney value={line.line.unitPrice} />
              </p>
            </td>
            <td className="py-1.5 text-center text-[13px] font-bold tabular-nums">
              {formatQty(line.line.qty)}
            </td>
            <td className="py-1.5 pe-0.5 text-end text-[13px] font-bold whitespace-nowrap tabular-nums">
              <ReceiptMoney value={line.gross} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The one figure the customer pays, reversed out of solid black. */
export function ReceiptGrandTotal({ value }: { readonly value: Paisa }) {
  return (
    <div
      className={cn(
        'my-3 flex items-baseline justify-between gap-2 bg-black px-2.5 py-2 text-white',
        INK_EXACT,
      )}
    >
      <span className="text-sm font-black tracking-[0.2em]">TOTAL</span>
      <span className="text-2xl font-black tabular-nums">
        <ReceiptMoney value={value} symbol="Rs." />
      </span>
    </div>
  );
}

/** A closing line between two dashed rules. */
export function ReceiptNote({ children }: { readonly children: ReactNode }) {
  return (
    <p className="mt-3 border-y border-dashed border-black py-1.5 text-center text-xs font-bold tracking-[0.12em] uppercase">
      {children}
    </p>
  );
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
        'mx-auto border border-black/20 bg-white px-3 py-4 text-xs leading-tight text-black print:border-0',
        widthMm === 80 ? 'w-[22rem]' : 'w-[17rem]',
        className,
      )}
    >
      <header className="text-center">
        <p className="text-2xl leading-none font-black tracking-[0.08em] uppercase">
          {outlet.tradingName}
        </p>
        <p className="mx-auto mt-1.5 max-w-[90%] text-[11px] leading-snug">
          {outlet.address}, {outlet.city}
        </p>
        {showTaxIdentity && outlet.ntn.trim() !== '' && (
          <p className="mt-0.5 text-[11px] font-bold">NTN {outlet.ntn}</p>
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
        <p className="mt-2 text-[9px] tracking-wide">{VENDOR_FOOTER_LINE}</p>
      </footer>
    </article>
  );
}
