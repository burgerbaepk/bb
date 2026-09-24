import type { BrandConfig } from '@natech/branding';
import {
  OFFLINE_INVOICE_BANNER,
  type Invoice,
  type Order,
  type OutletConfig,
} from '@natech/contracts';
import {
  PAYMENT_METHOD_LABELS,
  formatBusinessDate,
  formatDateTime,
  formatRate,
} from '@/components/lib/format';
import {
  ReceiptFrame,
  ReceiptGrandTotal,
  ReceiptItems,
  ReceiptNote,
  ReceiptOrderDetails,
  ReceiptRow,
  ReceiptTitle,
} from './ReceiptFrame';
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
  return (
    <ReceiptFrame
      outlet={outlet}
      showTaxIdentity={invoice.taxLines.length > 0}
      widthMm={widthMm}
      operatorFooterLines={operatorFooterLines}
      operatorHeaderLines={operatorHeaderLines}
      paymentDetails={paymentDetails}
    >
      <ReceiptTitle
        title={invoice.taxLines.length === 0 ? 'SALE RECEIPT' : 'TAX INVOICE'}
        subtitle={
          showUrdu && invoice.taxLines.length !== 0 ? (
            <span lang="ur" dir="rtl">
              ٹیکس انوائس
            </span>
          ) : undefined
        }
      />

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
      <div className="text-center">
        <p className="text-[10px] font-bold tracking-[0.18em]">
          {offline ? 'ORDER NO.' : 'INVOICE NO.'}
        </p>
        <p className="text-2xl leading-none font-black tracking-wide">
          {offline ? order.orderNo : invoice.localNo}
        </p>
      </div>
      <div className="mt-2 mb-2 flex justify-between text-[11px] font-semibold">
        <span>{formatDateTime(invoice.finalizedAt, outlet.timezone).toUpperCase()}</span>
        <span>ORDER #{order.orderNo}</span>
      </div>
      {/* §5.8, defect C6 — the business date is stamped at finalize and labelled. */}
      <div className="-mt-1 mb-2 flex justify-between text-[10px]">
        <span>Business date</span>
        <span>{formatBusinessDate(invoice.businessDate)}</span>
      </div>

      <ReceiptOrderDetails
        order={order}
        paymentLabel={invoice.payments
          .map((payment) => PAYMENT_METHOD_LABELS[payment.method])
          .join(' + ')}
      />
      <ReceiptItems order={order} showUrdu={showUrdu} />

      <div className="mt-3 space-y-1 px-0.5 text-[13px]">
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

      <ReceiptGrandTotal value={invoice.grandTotal} />

      <OrderOnlineQr url={storefrontUrl} />
      {offline && <p className="text-center font-semibold">{OFFLINE_INVOICE_BANNER}</p>}
      <ReceiptNote>Thank you! Please visit again.</ReceiptNote>
    </ReceiptFrame>
  );
}
