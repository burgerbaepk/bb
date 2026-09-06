import { priceLines } from '@natech/domain';
import type { BrandConfig } from '@natech/branding';
import {
  OFFLINE_INVOICE_BANNER,
  toDomainLines,
  type Invoice,
  type Order,
  type OutletConfig,
} from '@natech/contracts';
import {
  PAYMENT_METHOD_LABELS,
  formatBusinessDate,
  formatDateTime,
  formatQty,
  formatRate,
} from '@/components/lib/format';
import { ReceiptFrame, ReceiptRow, ReceiptRule } from './ReceiptFrame';
import { OrderOnlineQr } from './OrderOnlineQr';
import { ReceiptMoney } from './ReceiptMoney';

/**
 * The tax invoice — BUILD-PLAN.md §6.1, §7.1, §7.5, §7.8, §8.
 *
 * PSTSA s.30(1) fixes most of what appears here and none of it is optional:
 * the provider's name, address, and registration number; the recipient; a
 * description of the services; the value exclusive of tax; the amount of tax;
 * and the value inclusive of tax.
 *
 * Two banners exist because a sale can complete before its fiscal numbers do.
 * §7.8: if the inline 1200 ms transmission attempt times out, the invoice still
 * prints, with its own number and `FISCAL REGISTRATION PENDING`, and becomes
 * reprintable in full once the authority answers. §8: an invoice finalized
 * offline prints `PROVISIONAL — FISCAL PENDING` instead, because the gap-free
 * number is allocated server-side only.
 */
export interface TaxInvoiceReceiptProps {
  readonly storefrontUrl?: string | null | undefined;
  readonly outlet: OutletConfig;
  readonly order: Order;
  readonly invoice: Invoice;
  readonly widthMm?: 58 | 80 | undefined;
  readonly showUrdu?: boolean | undefined;
  readonly offline?: boolean | undefined;
  readonly operatorFooterLines?: readonly string[] | undefined;
  readonly operatorHeaderLines?: readonly string[] | undefined;
  readonly paymentDetails?: BrandConfig['receipt']['paymentDetails'] | undefined;
}

export function TaxInvoiceReceipt({
  outlet,
  storefrontUrl,
  order,
  invoice,
  widthMm = 80,
  showUrdu = false,
  offline = false,
  operatorFooterLines = [],
  operatorHeaderLines = [],
  paymentDetails,
}: TaxInvoiceReceiptProps) {
  const priced = priceLines(toDomainLines(order));

  return (
    <ReceiptFrame
      outlet={outlet}
      showTaxIdentity={invoice.taxLines.length > 0}
      widthMm={widthMm}
      operatorFooterLines={operatorFooterLines}
      operatorHeaderLines={operatorHeaderLines}
      paymentDetails={paymentDetails}
    >
      <ReceiptRule />

      <div className="text-center">
        <p className="text-base font-black tracking-[0.12em]">
          {invoice.taxLines.length === 0 ? 'SALE RECEIPT' : 'TAX INVOICE'}
        </p>
        {showUrdu && invoice.taxLines.length !== 0 && (
          <p lang="ur" dir="rtl">
            ٹیکس انوائس
          </p>
        )}
      </div>

      <ReceiptRule />

      {/* §5.8 — the allocated number, on its own line and at document weight.
          It is what the invoice is *called*: it identifies this sale in the
          register, in the auditor pack, and in any authority correspondence,
          and it is the number a customer quotes on a complaint. It does not
          depend on tax: a zero-rated sale prints SALE RECEIPT rather than TAX
          INVOICE and is still a numbered document off the same gap-free
          counter, so the number is never conditional on `taxLines`.

          §8 is the one exception, and it is an absence rather than a
          condition — an invoice finalized offline has no `local_no` yet
          because the counter is server-side, so the document falls back to
          the order number and says so. */}
      <div className="border-b border-dashed border-black pb-1 text-center">
        <p className="text-[10px] tracking-[0.14em]">{offline ? 'ORDER NO.' : 'INVOICE NO.'}</p>
        <p className="text-lg font-black tracking-wide">
          {offline ? order.orderNo : invoice.localNo}
        </p>
      </div>
      <div className="flex justify-between border-b border-dashed border-black py-1 font-semibold">
        <span>{formatDateTime(invoice.finalizedAt, outlet.timezone).toUpperCase()}</span>
        <span>ORDER: {order.orderNo}</span>
      </div>
      <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <span>TYPE:</span>
        <span className="text-end font-semibold">{order.type.replace('_', ' ')}</span>
        <span>MODE:</span>
        <span className="text-end font-semibold">
          {invoice.payments.map((payment) => PAYMENT_METHOD_LABELS[payment.method]).join(' + ')}
        </span>
        {order.type === 'DINE_IN' && (
          <>
            <span className="text-base font-bold">TABLE:</span>
            <span className="text-end text-xl font-black">{order.tableCode ?? '—'}</span>
          </>
        )}
      </div>
      {/* §5.8, defect C6 — the business date is stamped at finalize and labelled. */}
      <div className="flex justify-between text-[10px]">
        <span>Business date</span>
        <span>{formatBusinessDate(invoice.businessDate)}</span>
      </div>
      <div className="mt-1 flex justify-between border-t border-dashed border-black pt-1 text-sm">
        <span>NAME:</span>
        <span className="font-semibold uppercase">{order.customerName ?? 'Walk-in Customer'}</span>
      </div>
      {order.customerPhone !== null && <p>Phone: {order.customerPhone}</p>}
      {order.type === 'DELIVERY' && order.deliveryAddress && (
        <p className="whitespace-pre-wrap break-words">Delivery address: {order.deliveryAddress}</p>
      )}

      <table className="mt-2 w-full table-fixed border-collapse text-start">
        <thead>
          <tr>
            <th className="w-[47%] border border-black px-1 py-0.5">DESCRIPTION</th>
            <th className="w-[9%] border border-black px-1 py-0.5 text-center">QTY</th>
            <th className="w-[22%] border border-black px-1 py-0.5 text-end">RATE</th>
            <th className="w-[22%] border border-black px-1 py-0.5 text-end">VALUE</th>
          </tr>
        </thead>
        <tbody>
          {priced
            .filter((line) => line.line.isVoid !== true)
            .map((line) => (
              <tr key={line.line.id}>
                <td className="border border-black px-1 py-1 font-semibold break-words">
                  {line.line.name}
                  {/* §15.1 — the item's own name, not the static banner below. */}
                  {showUrdu && line.line.nameUr !== null && line.line.nameUr !== undefined && (
                    <p className="font-normal" lang="ur" dir="rtl">
                      {line.line.nameUr}
                    </p>
                  )}
                </td>
                <td className="border border-black px-1 py-1 text-center">
                  {formatQty(line.line.qty)}
                </td>
                <td className="whitespace-nowrap border border-black px-1 py-1 text-end text-[11px]">
                  <ReceiptMoney value={line.line.unitPrice} />
                </td>
                <td className="whitespace-nowrap border border-black px-1 py-1 text-end text-[11px]">
                  <ReceiptMoney value={line.gross} />
                </td>
              </tr>
            ))}
        </tbody>
      </table>

      <div className="mt-3 space-y-1 px-1 text-sm">
        <ReceiptRow label="Subtotal" value={<ReceiptMoney value={invoice.subtotal} />} />
        {invoice.discountTotal !== 0n && (
          <ReceiptRow label="Discount" value={<ReceiptMoney value={invoice.discountTotal} />} />
        )}
        {/* s.30(1)(e) — show the reduced ex-tax value only when it differs. */}
        {invoice.taxableBase !== invoice.subtotal && (
          <ReceiptRow
            label={invoice.taxLines.length > 0 ? 'Total (ex tax)' : 'Total after discount'}
            value={<ReceiptMoney value={invoice.taxableBase} />}
          />
        )}
        {/* s.30(1)(f) — the amount of tax, per rate actually applied. */}
        {invoice.taxLines.map((taxLine) => (
          <ReceiptRow
            key={taxLine.id}
            label={`Sales tax @ ${formatRate(taxLine.rateBps)} (${PAYMENT_METHOD_LABELS[
              taxLine.paymentMethodScope
            ].toLowerCase()})`}
            value={<ReceiptMoney value={taxLine.amount} />}
          />
        ))}
        {invoice.posFee !== 0n && (
          <ReceiptRow label="POS service fee" value={<ReceiptMoney value={invoice.posFee} />} />
        )}
        {invoice.deliveryCharge !== undefined && invoice.deliveryCharge > 0n && (
          <ReceiptRow
            label="Delivery charges"
            value={<ReceiptMoney value={invoice.deliveryCharge} />}
          />
        )}
        {invoice.serviceCharge !== 0n && (
          <ReceiptRow
            label="Service charge"
            value={<ReceiptMoney value={invoice.serviceCharge} />}
          />
        )}
        {invoice.roundingAdj !== 0n && (
          <ReceiptRow label="Rounding" value={<ReceiptMoney value={invoice.roundingAdj} />} />
        )}
      </div>

      <div className="my-2 border-y-4 border-double border-black px-1 py-1 text-xl font-black">
        <ReceiptRow
          label="TOTAL:"
          value={<ReceiptMoney value={invoice.grandTotal} symbol="RS." />}
        />
      </div>

      <OrderOnlineQr url={storefrontUrl} />
      {offline && <p className="text-center font-semibold">{OFFLINE_INVOICE_BANNER}</p>}
      <div className="mt-3 border-y border-dashed border-black py-1 text-center text-sm font-bold italic">
        THANK YOU! PLEASE VISIT AGAIN.
      </div>
    </ReceiptFrame>
  );
}
