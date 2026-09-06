import { z } from 'zod';
import { PaisaWireSchema, QtyWireSchema } from './money';
import { OrderTypeSchema, PaymentMethodSchema, TaxClassKeySchema } from './enums';

/**
 * The offline replay contract — BUILD-PLAN.md §8.
 *
 * This is the one schema in the package that genuinely crosses a process
 * boundary: the POS service worker holds it, and `POST /api/sync/orders`
 * validates against it. Client and server must agree exactly, or a replayed
 * order is rejected **after** the sale has already completed on the terminal
 * and the customer has left.
 *
 * Everything is wire-form here — money as a paisa string, quantity as a decimal
 * string, timestamps as ISO-8601 — because this shape is JSON, not objects.
 *
 * The server recomputes the invoice authoritatively from these inputs and
 * returns the canonical figures. Any divergence between what the terminal
 * printed and what the server computes is logged to Sentry as `TAX_DRIFT`; it
 * is not silently accepted, because the two documents are already in a
 * customer's hand and the sales reports.
 */

export const QueuedLineSchema = z.object({
  clientLineUuid: z.uuid(),
  menuItemId: z.uuid().nullable(),
  variantId: z.uuid().nullable(),
  nameSnapshot: z.string().min(1),
  nameUrSnapshot: z.string().nullable(),
  qty: QtyWireSchema,
  unitPrice: PaisaWireSchema,
  lineDiscount: PaisaWireSchema,
  taxClass: TaxClassKeySchema,
  seatNo: z.int().positive().nullable(),
  note: z.string().nullable(),
  modifiers: z.array(
    z.object({
      modifierId: z.uuid().nullable(),
      nameSnapshot: z.string().min(1),
      nameUrSnapshot: z.string().nullable(),
      priceDelta: PaisaWireSchema,
    }),
  ),
});
export type QueuedLine = z.infer<typeof QueuedLineSchema>;

export const QueuedPaymentSchema = z.object({
  method: PaymentMethodSchema,
  amount: PaisaWireSchema,
  tendered: PaisaWireSchema.nullable(),
  change: PaisaWireSchema.nullable(),
  cardLast4: z.string().nullable(),
  attemptStatus: z.enum(['APPROVED', 'DECLINED']),
  declinedReason: z.string().nullable(),
  at: z.string(),
});
export type QueuedPayment = z.infer<typeof QueuedPaymentSchema>;

export const QueuedOrderSchema = z.object({
  /** R3, §8 — the idempotency key. A replay of the same order is one order. */
  clientOrderUuid: z.uuid(),
  terminalId: z.uuid(),
  orderNo: z.int().positive(),
  type: OrderTypeSchema,
  tableId: z.uuid().nullable(),
  guestCount: z.int().nonnegative().nullable(),
  waiterId: z.uuid().nullable(),
  note: z.string().nullable(),
  /** §6.7 — the server resolves the rate against this, not against replay time. */
  serviceStartedAt: z.string(),
  openedAt: z.string(),
  orderDiscount: PaisaWireSchema,
  deliveryAddress: z.string().trim().max(1000).nullable().optional(),
  deliveryCharge: PaisaWireSchema.refine(
    (v) => BigInt(v) >= 0n && BigInt(v) <= 100000000n,
  ).optional(),
  serviceChargeBpsOverride: z.int().min(0).max(10_000).nullable(),
  lines: z.array(QueuedLineSchema).min(1),
  payments: z.array(QueuedPaymentSchema),
  /** What the terminal computed, so the server can compare and report drift. */
  clientGrandTotal: PaisaWireSchema.nullable(),
  clientTaxTotal: PaisaWireSchema.nullable(),
  clientEngineVersion: z.string().min(1),
});
export type QueuedOrder = z.infer<typeof QueuedOrderSchema>;

export const SyncRequestSchema = z.object({
  terminalId: z.uuid(),
  queuedAtOldest: z.string(),
  orders: z.array(QueuedOrderSchema).min(1),
});
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

export const SyncResultSchema = z.object({
  clientOrderUuid: z.uuid(),
  accepted: z.boolean(),
  /** Server-side only (§8). Absent when the order failed to replay. */
  localNo: z.string().nullable(),
  invoiceId: z.uuid().nullable(),
  serverGrandTotal: PaisaWireSchema.nullable(),
  /** True when the server figure differs from the printed one. `TAX_DRIFT`. */
  drift: z.boolean(),
  error: z.string().nullable(),
});
export type SyncResult = z.infer<typeof SyncResultSchema>;

export const SyncResponseSchema = z.object({
  results: z.array(SyncResultSchema),
  serverTime: z.string(),
});
export type SyncResponse = z.infer<typeof SyncResponseSchema>;

/** §8 — what the offline banner reads. */
export const OfflineStateSchema = z.object({
  online: z.boolean(),
  queuedOrders: z.int().nonnegative(),
  secondsSinceLastSync: z.int().nonnegative(),
  /** §8 — refunds, shift close, and large discounts are blocked offline. */
  blockedActions: z.array(z.enum(['REFUND', 'SHIFT_CLOSE', 'SUPERVISOR_DISCOUNT'])),
});
export type OfflineState = z.infer<typeof OfflineStateSchema>;
