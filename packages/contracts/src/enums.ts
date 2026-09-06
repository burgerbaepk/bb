import { z } from 'zod';

/**
 * The enumerations — BUILD-PLAN.md §5.
 *
 * Every member list here mirrors a Postgres enum in `packages/db/src/schema.ts`
 * exactly, in the same order. They are restated rather than imported because
 * §3 forbids the service worker from reaching for Drizzle, and the offline path
 * validates an order against these before it ever reaches a server.
 */

export const PaymentMethodSchema = z.enum(['CASH', 'CARD', 'WALLET', 'QR']);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export const OrderChannelSchema = z.enum(['POS', 'WEB', 'PHONE']);
export type OrderChannel = z.infer<typeof OrderChannelSchema>;

export const OrderTypeSchema = z.enum(['DINE_IN', 'TAKE_AWAY', 'DELIVERY']);
export type OrderType = z.infer<typeof OrderTypeSchema>;

export const OrderStatusSchema = z.enum(['DRAFT', 'PLACED', 'SERVED', 'FINALIZED', 'VOIDED']);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const TableStatusSchema = z.enum([
  'FREE',
  'RESERVED',
  'SEATED',
  'ORDERED',
  'SERVED',
  'PAYING',
  'CLEANING',
  'BLOCKED',
]);
export type TableStatus = z.infer<typeof TableStatusSchema>;

export const TableShapeSchema = z.enum(['ROUND', 'SQUARE', 'RECT', 'BOOTH', 'BAR_STOOL']);
export type TableShape = z.infer<typeof TableShapeSchema>;

export const InvoiceStatusSchema = z.enum(['FINALIZED', 'CREDITED']);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

export const AttemptStatusSchema = z.enum(['APPROVED', 'DECLINED']);
export type AttemptStatus = z.infer<typeof AttemptStatusSchema>;

export const TaxClassKeySchema = z.enum(['STANDARD_FOOD', 'EXEMPT', 'ZERO']);
export type TaxClassKey = z.infer<typeof TaxClassKeySchema>;

export const CashMovementTypeSchema = z.enum(['PAY_IN', 'PAY_OUT', 'DROP']);
export type CashMovementType = z.infer<typeof CashMovementTypeSchema>;

/** §14.1 — the five roles. Permissions are strings; see `PermissionSchema`. */
export const RoleKeySchema = z.enum(['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'AUDITOR']);
export type RoleKey = z.infer<typeof RoleKeySchema>;

/**
 * §14.1 — checked server-side on every action. Client-side hiding is cosmetic,
 * which is why this list is a contract and not a UI concern.
 */
export const PermissionSchema = z.enum([
  'order.create',
  'order.send',
  'order.void',
  'discount.apply',
  'discount.override',
  'payment.take',
  'invoice.finalize',
  'invoice.refund',
  'table.manage',
  'menu.write',
  'floor.write',
  'staff.write',
  'shift.close',
  'reports.read',
  'reports.export',
  'expenses.write',
  'settings.read',
  'settings.write',
  'settings.tax.write',
]);
export type Permission = z.infer<typeof PermissionSchema>;

/** §15.1 — the storefront is localised; the POS and admin are English only. */
export const LocaleSchema = z.enum(['en', 'ur']);
export type Locale = z.infer<typeof LocaleSchema>;
