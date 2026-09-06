import type { Order, OutletConfig } from '@natech/contracts';
import { formatDateTime, formatQty } from '@/components/lib/format';
import { ReceiptFrame, ReceiptRule } from './ReceiptFrame';

export interface KitchenOrderTicketProps {
  readonly outlet: OutletConfig;
  readonly order: Order;
  readonly printedAt: Date;
  readonly widthMm: 58 | 80;
  readonly showUrdu: boolean;
}

/** A snapshot of the current cart for the kitchen. Printing does not place or charge an order. */
export function KitchenOrderTicket({
  outlet,
  order,
  printedAt,
  widthMm,
  showUrdu,
}: KitchenOrderTicketProps) {
  return (
    <ReceiptFrame outlet={outlet} widthMm={widthMm} showTaxIdentity={false}>
      <ReceiptRule />
      <h1 className="text-center text-lg font-black">KITCHEN ORDER TICKET</h1>
      <p className="text-center text-xl font-black">ORDER #{order.orderNo}</p>
      <p>{formatDateTime(printedAt, outlet.timezone)}</p>
      <p className="text-lg font-bold">{order.type.replaceAll('_', ' ')}</p>
      {order.type === 'DINE_IN' && (
        <p className="text-xl font-black">TABLE: {order.tableCode ?? '—'}</p>
      )}
      {order.customerName && <p>Customer: {order.customerName}</p>}
      <ReceiptRule />
      <table className="w-full table-fixed text-start">
        <thead>
          <tr>
            <th className="w-12 text-start">QTY</th>
            <th className="text-start">ITEM</th>
          </tr>
        </thead>
        <tbody>
          {order.lines
            .filter((line) => line.voidReason === null)
            .map((line) => (
              <tr key={line.id} className="border-b border-dashed border-black align-top">
                <td className="py-2 text-lg font-black">{formatQty(line.qty)}</td>
                <td className="py-2 break-words">
                  <p className="text-base font-bold">{line.nameSnapshot}</p>
                  {line.variantLabel && <p>{line.variantLabel}</p>}
                  {showUrdu && line.nameUrSnapshot && (
                    <p lang="ur" dir="rtl">
                      {line.nameUrSnapshot}
                    </p>
                  )}
                  {line.modifiers.map((modifier) => (
                    <p key={modifier.id}>
                      + {modifier.nameSnapshot}
                      {showUrdu && modifier.nameUrSnapshot && (
                        <span lang="ur" dir="rtl">
                          {' '}
                          · {modifier.nameUrSnapshot}
                        </span>
                      )}
                    </p>
                  ))}
                  {line.seatNo !== null && <p>Seat: {line.seatNo}</p>}
                  {line.note && <p className="whitespace-pre-wrap font-bold">Note: {line.note}</p>}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
      {order.note && <p className="mt-2 whitespace-pre-wrap font-bold">Order note: {order.note}</p>}
    </ReceiptFrame>
  );
}
