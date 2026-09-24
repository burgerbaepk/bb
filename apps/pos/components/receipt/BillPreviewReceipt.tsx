import type { Totals } from '@natech/domain';
import type { Order, OutletConfig, PaymentMethod } from '@natech/contracts';
import type { BrandConfig } from '@natech/branding';
import { PAYMENT_METHOD_LABELS, formatRate } from '@/components/lib/format';
import {
  ReceiptFrame,
  ReceiptGrandTotal,
  ReceiptItems,
  ReceiptNote,
  ReceiptOrderDetails,
  ReceiptRow,
  ReceiptTitle,
} from './ReceiptFrame';
import { ReceiptMoney } from './ReceiptMoney';

export interface BillPreviewReceiptProps {
  readonly outlet: OutletConfig;
  readonly order: Order;
  readonly totals: Totals;
  readonly paymentMethod: PaymentMethod;
  readonly widthMm?: 58 | 80 | undefined;
  readonly showUrdu?: boolean | undefined;
  readonly operatorHeaderLines?: readonly string[] | undefined;
  readonly operatorFooterLines?: readonly string[] | undefined;
  readonly paymentDetails?: BrandConfig['receipt']['paymentDetails'] | undefined;
}

/** A non-fiscal, pre-finalization bill used only to verify the current order. */
export function BillPreviewReceipt({
  outlet,
  order,
  totals,
  paymentMethod,
  widthMm = 80,
  showUrdu = false,
  operatorHeaderLines = [],
  operatorFooterLines = [],
  paymentDetails,
}: BillPreviewReceiptProps) {
  return (
    <ReceiptFrame
      outlet={outlet}
      showTaxIdentity={totals.taxLines.length > 0}
      widthMm={widthMm}
      operatorHeaderLines={operatorHeaderLines}
      operatorFooterLines={operatorFooterLines}
      paymentDetails={paymentDetails}
    >
      <ReceiptTitle
        title="BILL PREVIEW"
        subtitle={totals.taxLines.length === 0 ? 'Not final' : 'Not final · Not a tax invoice'}
      />

      <div className="mb-2 text-center">
        <p className="text-[10px] font-bold tracking-[0.18em]">ORDER NO.</p>
        <p className="text-2xl leading-none font-black">{order.orderNo}</p>
      </div>

      <ReceiptOrderDetails order={order} paymentLabel={PAYMENT_METHOD_LABELS[paymentMethod]} />
      <ReceiptItems order={order} showUrdu={showUrdu} />

      <div className="mt-3 space-y-1 px-0.5 text-[13px]">
        <ReceiptRow label="Subtotal" value={<ReceiptMoney value={totals.subtotal} />} />
        {totals.discountTotal !== 0n && (
          <ReceiptRow label="Discount" value={<ReceiptMoney value={totals.discountTotal} />} />
        )}
        {totals.taxableBase !== totals.subtotal && (
          <ReceiptRow
            label={totals.taxLines.length > 0 ? 'Total (ex tax)' : 'Total after discount'}
            value={<ReceiptMoney value={totals.taxableBase} />}
          />
        )}
        {totals.taxLines.map((line, index) => (
          <ReceiptRow
            key={`${line.paymentMethodScope}-${line.taxClass}-${index}`}
            label={`Sales tax @ ${formatRate(line.rateBps)}`}
            value={<ReceiptMoney value={line.amount} />}
          />
        ))}
        {totals.deliveryCharge !== undefined && totals.deliveryCharge > 0n && (
          <ReceiptRow
            label="Delivery charges"
            value={<ReceiptMoney value={totals.deliveryCharge} />}
          />
        )}
        {totals.serviceCharge !== 0n && (
          <ReceiptRow
            label="Service charge"
            value={<ReceiptMoney value={totals.serviceCharge} />}
          />
        )}
        {totals.posFee !== 0n && (
          <ReceiptRow label="POS service fee" value={<ReceiptMoney value={totals.posFee} />} />
        )}
        {totals.roundingAdj !== 0n && (
          <ReceiptRow label="Rounding" value={<ReceiptMoney value={totals.roundingAdj} />} />
        )}
      </div>
      <ReceiptGrandTotal value={totals.grandTotal} />
      <ReceiptNote>Verify details before finalizing</ReceiptNote>
    </ReceiptFrame>
  );
}
