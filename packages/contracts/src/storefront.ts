import { z } from 'zod';
import { PaisaSchema, QtySchema } from './money';
import { LocaleSchema, OrderStatusSchema } from './enums';

/**
 * Storefront — BUILD-PLAN.md §13, §15.1.
 *
 * §13.2 is the constraint that shapes this file: the storefront shows **ex-tax
 * prices only**, with a notice explaining that tax is added at payment, 16% on
 * cash and 8% on card and digital. There is therefore no tax-inclusive field
 * anywhere here. The payment method is unknown until the counter, so any
 * inclusive figure the storefront could show would be a guess presented as a
 * price.
 *
 * Every customer-facing string carries an Urdu counterpart (§15.1), and the
 * cart survives a reload in `web_sessions.cart` (§5.11).
 */

export const PublicMenuItemSchema = z.object({
  id: z.uuid(),
  slug: z.string().min(1),
  categorySlug: z.string().min(1),
  name: z.string().min(1),
  nameUr: z.string().nullable(),
  description: z.string().nullable(),
  descriptionUr: z.string().nullable(),
  imageUrl: z.string().nullable(),
  /** §13.2 — ex tax. There is no inclusive counterpart by design. */
  priceExTax: PaisaSchema,
  variants: z.array(
    z.object({
      id: z.uuid(),
      name: z.string().min(1),
      nameUr: z.string().nullable(),
      priceExTax: PaisaSchema,
      isDefault: z.boolean(),
      imageUrl: z.string().nullable().optional(),
    }),
  ),
  isAvailable: z.boolean(),
});
export type PublicMenuItem = z.infer<typeof PublicMenuItemSchema>;

export const PublicCategorySchema = z.object({
  id: z.uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  nameUr: z.string().nullable(),
  sortOrder: z.int(),
});
export type PublicCategory = z.infer<typeof PublicCategorySchema>;

export const PublicMenuSchema = z.object({
  categories: z.array(PublicCategorySchema),
  items: z.array(PublicMenuItemSchema),
});
export type PublicMenu = z.infer<typeof PublicMenuSchema>;

export const CartLineSchema = z.object({
  lineId: z.string().min(1),
  itemId: z.uuid(),
  variantId: z.uuid().nullable(),
  name: z.string().min(1),
  nameUr: z.string().nullable(),
  variantLabel: z.string().nullable(),
  qty: QtySchema,
  unitPriceExTax: PaisaSchema,
  note: z.string().nullable(),
});
export type CartLine = z.infer<typeof CartLineSchema>;

export const CartSchema = z.object({
  lines: z.array(CartLineSchema),
  /** §5.11 — bound from the QR token, so the order lands on the right table. */
  tableToken: z.string().nullable(),
  tableCode: z.string().nullable(),
  note: z.string().nullable(),
});
export type Cart = z.infer<typeof CartSchema>;

/** §5.11, §13.1 — `/t/[token]` resolves the table and opens the ordering sheet. */
export const QrResolutionSchema = z.object({
  token: z.string().min(1),
  tableId: z.uuid(),
  tableCode: z.string().min(1),
  zoneName: z.string().min(1),
  isActive: z.boolean(),
});
export type QrResolution = z.infer<typeof QrResolutionSchema>;

/**
 * §13.3 — email OTP. Six digits, 10-minute TTL, single use, five verify attempts
 * then the code burns. The code itself never appears in a contract, a log, or a
 * response; only its lifecycle does.
 */
export const OtpRequestSchema = z.object({
  email: z.string(),
  locale: LocaleSchema,
});
export type OtpRequest = z.infer<typeof OtpRequestSchema>;

export const OtpChallengeSchema = z.object({
  email: z.string(),
  expiresAt: z.date(),
  attemptsRemaining: z.int().nonnegative(),
  /** §13.3 — 3 sends per email per hour, 5 per IP per hour. */
  resendAvailableAt: z.date(),
});
export type OtpChallenge = z.infer<typeof OtpChallengeSchema>;

export const OtpVerifySchema = z.object({
  email: z.string(),
  code: z.string().regex(/^\d{6}$/, 'a code is six digits'),
});
export type OtpVerify = z.infer<typeof OtpVerifySchema>;

/** §13.4 — what `/order/[publicId]` renders. Never auto-accepted (§13.4). */
export const PublicOrderStatusSchema = z.object({
  publicId: z.string().min(1),
  orderNo: z.int().positive(),
  status: OrderStatusSchema,
  decision: z.enum(['PENDING', 'ACCEPTED', 'REJECTED']),
  rejectReason: z.string().nullable(),
  tableCode: z.string().nullable(),
  placedAt: z.date(),
  acceptedAt: z.date().nullable(),
  lines: z.array(
    z.object({
      name: z.string().min(1),
      nameUr: z.string().nullable(),
      qtyLabel: z.string().min(1),
      /** §13.2 — ex tax, matching what the customer saw on the menu. */
      lineTotalExTax: PaisaSchema,
    }),
  ),
  /**
   * §6.9 — the storefront never shows a total including tax. The customer pays
   * at the counter against a check, and the check states both rates.
   */
  subtotalExTax: PaisaSchema,
});
export type PublicOrderStatus = z.infer<typeof PublicOrderStatusSchema>;
