import { z } from 'zod';
import type { OrderLine as DomainOrderLine } from '@natech/domain';
import { PaisaSchema, QtySchema } from './money';
import { OrderChannelSchema, OrderStatusSchema, OrderTypeSchema, TaxClassKeySchema } from './enums';

/**
 * Orders — BUILD-PLAN.md §5.6, §6.9, §11.
 *
 * **There is no tax field in this file, and there must not be one** (R9).
 *
 * The authoritative figure lives on the invoice, computed once at finalize. An
 * order before that has a `subtotalExTax` and nothing more, because the rate
 * is not knowable until the customer chooses how to pay — 16% on cash, 8% on
 * card. The system this replaces labels the cart `Tax (16%)` regardless of
 * method (defect C5); the fix is that no order-shaped object here can carry the
 * number.
 *
 * `nameSnapshot` and `unitPrice` are snapshots taken at add time (§5.6). A menu
 * edit at 21:00 must not alter an invoice transmitted at 20:15.
 */

export const OrderLineModifierSchema = z.object({
  id: z.uuid(),
  modifierId: z.uuid().nullable(),
  nameSnapshot: z.string().min(1),
  nameUrSnapshot: z.string().nullable(),
  priceDelta: PaisaSchema,
});
export type OrderLineModifier = z.infer<typeof OrderLineModifierSchema>;

export const OrderLineSchema = z.object({
  id: z.uuid(),
  menuItemId: z.uuid().nullable(),
  variantId: z.uuid().nullable(),
  nameSnapshot: z.string().min(1),
  nameUrSnapshot: z.string().nullable(),
  variantLabel: z.string().nullable(),
  qty: QtySchema,
  unitPrice: PaisaSchema,
  lineDiscount: PaisaSchema,
  taxClass: TaxClassKeySchema,
  seatNo: z.int().positive().nullable(),
  note: z.string().nullable(),
  voidReason: z.string().nullable(),
  modifiers: z.array(OrderLineModifierSchema),
});
export type OrderLine = z.infer<typeof OrderLineSchema>;

export const OrderSchema = z.object({
  id: z.uuid(),
  /** Resets daily. Human-facing, spoken aloud across a counter (§5.6, C7). */
  orderNo: z.int().positive(),
  channel: OrderChannelSchema,
  type: OrderTypeSchema,
  status: OrderStatusSchema,
  tableId: z.uuid().nullable(),
  tableCode: z.string().nullable(),
  zoneName: z.string().nullable(),
  tableSessionId: z.uuid().nullable(),
  customerName: z.string().nullable(),
  /** M20 — printed on the tax invoice under `customerName`, and stored on `customers.phone`; see ADR 0016. */
  customerPhone: z.string().nullable(),
  waiterInitials: z.string().nullable(),
  guestCount: z.int().nonnegative().nullable(),
  note: z.string().nullable(),
  /** §8 — the offline replay idempotency key. */
  clientOrderUuid: z.uuid(),
  /** §5.8 — explicit, never derived at read time (defect C6). */
  businessDate: z.string(),
  /** §6.7 — PSTSA s.13 resolves the rate against this, never at finalize. */
  serviceStartedAt: z.date(),
  openedAt: z.date(),
  lines: z.array(OrderLineSchema),
  /** Order-level discount, applied before tax under the §6.8 default. */
  orderDiscount: PaisaSchema,
  discountReason: z.string().nullable(),
  /** Null follows the outlet default; 0 disables it for this invoice. */
  deliveryAddress: z.string().trim().max(1000).nullable().optional(),
  deliveryCharge: PaisaSchema.optional(),
  serviceChargeBpsOverride: z.int().min(0).max(10_000).nullable(),
});
export type Order = z.infer<typeof OrderSchema>;

/**
 * §11.3 — the active-orders tray card.
 *
 * ADR 0019 — there is no more pre-payment check, so the card shows
 * `Subtotal (ex tax)` and `TAKE PAYMENT` once an order reaches `SERVED`,
 * nothing else; the real total is not knowable until the customer pays.
 */
export const TrayOrderSchema = z.object({
  orderId: z.uuid(),
  orderNo: z.int().positive(),
  channel: OrderChannelSchema,
  type: OrderTypeSchema,
  status: OrderStatusSchema,
  tableCode: z.string().nullable(),
  zoneName: z.string().nullable(),
  customerName: z.string().nullable(),
  guestCount: z.int().nonnegative().nullable(),
  waiterInitials: z.string().nullable(),
  itemCount: z.int().nonnegative(),
  lineSummary: z.array(z.string()),
  /** Never negative (R13, defect V2). */
  elapsedSeconds: z.int().nonnegative(),
  subtotalExTax: PaisaSchema,
  paymentBreakdowns: z.array(
    z.object({
      method: z.enum(['CASH', 'CARD']),
      discountTotal: PaisaSchema,
      taxableBase: PaisaSchema,
      taxTotal: PaisaSchema,
      taxRatesBps: z.array(z.int().nonnegative()),
      deliveryCharge: PaisaSchema.optional(),
      serviceCharge: PaisaSchema,
      posFee: PaisaSchema,
      roundingAdj: PaisaSchema,
      grandTotal: PaisaSchema,
    }),
  ),
});
export type TrayOrder = z.infer<typeof TrayOrderSchema>;

/** §13.4 — a web order is never auto-accepted. */
export const WebOrderSchema = z.object({
  orderId: z.uuid(),
  publicId: z.string().min(1),
  orderNo: z.int().positive(),
  placedAt: z.date(),
  customerName: z.string().min(1),
  customerEmail: z.string(),
  /**
   * ADR 0022 — the web-order inbox is the surface that required these, and
   * ADR 0008 permits the addition on exactly that basis. A take-away order
   * arrives with no table and previously with no way to reach the person who
   * placed it: staff could accept it, and then had an email address and a
   * kitchen ticket. Nullable because every order placed before sign-up
   * collected them has neither.
   */
  customerPhone: z.string().nullable(),
  customerAddress: z.string().nullable(),
  tableCode: z.string().nullable(),
  itemCount: z.int().nonnegative(),
  subtotalExTax: PaisaSchema,
  lines: z.array(OrderLineSchema),
  note: z.string().nullable(),
  decision: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']),
  rejectReason: z.string().nullable(),
});
export type WebOrder = z.infer<typeof WebOrderSchema>;

/**
 * Map an order onto the engine's line shape. Voided lines price at zero.
 *
 * ADR 0025 moved this out of `mocks/orders.ts`. It contains no data — it is
 * the one translation between a wire order and `@natech/domain`'s pricing
 * input, and three shipped surfaces (`PaymentSheet`, `TaxInvoiceReceipt`,
 * `BillPreviewReceipt`) price live orders through it. Living under `mocks/`
 * meant production code importing from a mock entry point, which is both
 * misleading and the reason the mock-import gate could not simply be switched
 * on.
 */
export function toDomainLines(order: Order): DomainOrderLine[] {
  return order.lines.map((orderLine) => ({
    id: orderLine.id,
    name: orderLine.nameSnapshot,
    nameUr: orderLine.nameUrSnapshot,
    taxClass: orderLine.taxClass,
    unitPrice: orderLine.unitPrice,
    qty: orderLine.qty,
    modifiers: orderLine.modifiers.map((modifier) => ({
      name: modifier.nameSnapshot,
      nameUr: modifier.nameUrSnapshot,
      priceDelta: modifier.priceDelta,
    })),
    lineDiscount: orderLine.lineDiscount,
    isVoid: orderLine.voidReason !== null,
  }));
}
