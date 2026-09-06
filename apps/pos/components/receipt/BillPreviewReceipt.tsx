import { priceLines, type Totals } from '@natech/domain';
import {
  toDomainLines,
  type Order,
  type OutletConfig,
  type PaymentMethod,
} from '@natech/contracts';
import type { BrandConfig } from '@natech/branding';
import { PAYMENT_METHOD_LABELS, formatQty, formatRate } from '@/components/lib/format';
import { ReceiptFrame, ReceiptRow, ReceiptRule } from './ReceiptFrame';
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
  const priced = priceLines(toDomainLines(order));

  return (
    <ReceiptFrame
      outlet={outlet}
      showTaxIdentity={totals.taxLines.length > 0}
      widthMm={widthMm}
      operatorHeaderLines={operatorHeaderLines}
      operatorFooterLines={operatorFooterLines}
      paymentDetails={paymentDetails}
    >
      <ReceiptRule />
      <div className="text-center">
        <p className="text-base font-black tracking-[0.12em]">BILL PREVIEW</p>
        <p className="font-semibold">
          {totals.taxLines.length === 0 ? 'NOT FINAL' : 'NOT FINAL · NOT A TAX INVOICE'}
        </p>
      </div>
      <ReceiptRule />

      <div className="flex justify-end border-b border-dashed border-black pb-1 font-semibold">
        <span>ORDER: {order.orderNo}</span>
      </div>
      <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <span>TYPE:</span>
        <span className="text-end font-semibold">{order.type.replace('_', ' ')}</span>
        <span>MODE:</span>
        <span className="text-end font-semibold">{PAYMENT_METHOD_LABELS[paymentMethod]}</span>
        {order.type === 'DINE_IN' && (
          <>
            <span className="text-base font-bold">TABLE:</span>
            <span className="text-end text-xl font-black">{order.tableCode ?? '—'}</span>
          </>
        )}
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
                  {showUrdu && line.line.nameUr != null && (
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
      <div className="my-2 border-y-4 border-double border-black px-1 py-1 text-xl font-black">
        <ReceiptRow
          label="TOTAL:"
          value={<ReceiptMoney value={totals.grandTotal} symbol="RS." />}
        />
      </div>
      <div className="mt-3 border-y border-dashed border-black py-1 text-center text-sm font-bold italic">
        VERIFY DETAILS BEFORE FINALIZING
      </div>
    </ReceiptFrame>
  );
}
