import { z } from 'zod';
import { PaisaSchema, RateBpsSchema } from './money';
import {
  CashMovementTypeSchema,
  OrderChannelSchema,
  PaymentMethodSchema,
  TaxClassKeySchema,
} from './enums';

/**
 * Reporting — BUILD-PLAN.md §17, §12, §6.13, R16.
 *
 * Every report row here carries its own figures, and every screen derives its
 * header count and header sum from the rows it renders (R16). The system this
 * replaces shows `Total Revenue Rs. 0` beside `Total Orders 19984` (defect C3)
 * and a four-order header above three cards (defect V1); both are a header fed
 * by a different query than its list.
 *
 * Dates are **business dates** (§5.8), stamped at finalize from the cutoff and
 * labelled as such on every surface. Defect C6 is an invoice numbered for the
 * 21st displayed against the 22nd because the date was derived at read time.
 */

export const DateRangeSchema = z.object({
  fromBusinessDate: z.string(),
  toBusinessDate: z.string(),
});
export type DateRange = z.infer<typeof DateRangeSchema>;

export const SalesByDateRowSchema = z.object({
  businessDate: z.string(),
  invoiceCount: z.int().nonnegative(),
  covers: z.int().nonnegative(),
  netSales: PaisaSchema,
  taxCollected: PaisaSchema,
  deliveryCharge: PaisaSchema.optional(),
  serviceCharge: PaisaSchema,
  grossTakings: PaisaSchema,
});
export type SalesByDateRow = z.infer<typeof SalesByDateRowSchema>;

export const ItemSalesRowSchema = z.object({
  itemName: z.string().min(1),
  categoryName: z.string().min(1),
  qtySold: z.string().min(1),
  netSales: PaisaSchema,
});
export type ItemSalesRow = z.infer<typeof ItemSalesRowSchema>;

export const CategoryMixRowSchema = z.object({
  categoryName: z.string().min(1),
  itemCount: z.int().nonnegative(),
  netSales: PaisaSchema,
  shareBps: RateBpsSchema,
});
export type CategoryMixRow = z.infer<typeof CategoryMixRowSchema>;

export const ChannelMixRowSchema = z.object({
  channel: OrderChannelSchema,
  orderCount: z.int().nonnegative(),
  netSales: PaisaSchema,
  shareBps: RateBpsSchema,
});
export type ChannelMixRow = z.infer<typeof ChannelMixRowSchema>;

export const PaymentMixRowSchema = z.object({
  method: PaymentMethodSchema,
  approvedCount: z.int().nonnegative(),
  declinedCount: z.int().nonnegative(),
  amount: PaisaSchema,
  shareBps: RateBpsSchema,
});
export type PaymentMixRow = z.infer<typeof PaymentMixRowSchema>;

/** Tax summary split by rate and payment method. */
export const TaxLiabilityRowSchema = z.object({
  taxClass: TaxClassKeySchema,
  rateBps: RateBpsSchema,
  method: PaymentMethodSchema,
  taxableValue: PaisaSchema,
  taxCollected: PaisaSchema,
  invoiceCount: z.int().nonnegative(),
  legalReference: z.string().min(1),
});
export type TaxLiabilityRow = z.infer<typeof TaxLiabilityRowSchema>;

/** §17 — Floor Performance. None of this is answerable without `table_sessions`. */
export const FloorPerformanceRowSchema = z.object({
  zoneName: z.string().min(1),
  daypart: z.string().min(1),
  turns: z.string().min(1),
  averageDwellSeconds: z.int().nonnegative(),
  covers: z.int().nonnegative(),
  revenuePerSeatHour: PaisaSchema,
  deadTableSeconds: z.int().nonnegative(),
});
export type FloorPerformanceRow = z.infer<typeof FloorPerformanceRowSchema>;

export const CoversPerWaiterRowSchema = z.object({
  waiterName: z.string().min(1),
  covers: z.int().nonnegative(),
  orders: z.int().nonnegative(),
  netSales: PaisaSchema,
  averageDwellSeconds: z.int().nonnegative(),
});
export type CoversPerWaiterRow = z.infer<typeof CoversPerWaiterRowSchema>;

/** §17 exception reports. Each row names the actor; that is the point of them. */
export const ExceptionKindSchema = z.enum([
  'VOID_ORDER',
  'DISCOUNT',
  'PRICE_OVERRIDE',
  'DECLINED_CARD',
  /**
   * ADR 0027 — a bill was shown or printed for an order that never became an
   * invoice. The replacement for §6.13's abandoned-check signal, which ADR
   * 0019 removed with the printed check and recorded as having none.
   *
   * Added after the Phase-1 freeze (ADR 0008), through §0 rule 7's escape
   * hatch: a decision record, not a silent edit. Widening an enum is additive
   * — no existing producer or consumer of an `ExceptionRow` changes meaning.
   */
  'BILL_NOT_FINALIZED',
]);
export type ExceptionKind = z.infer<typeof ExceptionKindSchema>;

export const ExceptionRowSchema = z.object({
  id: z.uuid(),
  kind: ExceptionKindSchema,
  at: z.date(),
  businessDate: z.string(),
  actorName: z.string().min(1),
  reference: z.string().min(1),
  tableCode: z.string().nullable(),
  amount: PaisaSchema,
  reason: z.string().nullable(),
  supervisorName: z.string().nullable(),
});
export type ExceptionRow = z.infer<typeof ExceptionRowSchema>;

export const CashMovementRowSchema = z.object({
  id: z.uuid(),
  type: CashMovementTypeSchema,
  amount: PaisaSchema,
  reason: z.string().min(1),
  actorName: z.string().min(1),
  at: z.date(),
});
export type CashMovementRow = z.infer<typeof CashMovementRowSchema>;

/** §12, §17 — the X and Z reports. */
export const ShiftReportSchema = z.object({
  shiftId: z.uuid(),
  kind: z.enum(['X', 'Z']),
  openedAt: z.date(),
  closedAt: z.date().nullable(),
  openedByName: z.string().min(1),
  businessDate: z.string(),
  openingFloat: PaisaSchema,
  expectedCash: PaisaSchema,
  countedCash: PaisaSchema.nullable(),
  variance: PaisaSchema.nullable(),
  paymentMix: z.array(PaymentMixRowSchema),
  cashMovements: z.array(CashMovementRowSchema),
  invoiceCount: z.int().nonnegative(),
  netSales: PaisaSchema,
  taxCollected: PaisaSchema,
});
export type ShiftReport = z.infer<typeof ShiftReportSchema>;

/** §17 — s.32(2) access pack. Read-only, date-ranged, permission-gated. */
export const AuditorPackSchema = z.object({
  range: DateRangeSchema,
  invoiceCount: z.int().nonnegative(),
  creditNoteCount: z.int().nonnegative(),
  taxCollected: PaisaSchema,
  generatedAt: z.date(),
  /** §17 — six years from the end of the financial year (s.32(1)). */
  retentionUntil: z.string(),
  contents: z.array(z.object({ label: z.string().min(1), rowCount: z.int().nonnegative() })),
});
export type AuditorPack = z.infer<typeof AuditorPackSchema>;

export const ExportFormatSchema = z.enum(['CSV', 'XLSX', 'PDF']);
export type ExportFormat = z.infer<typeof ExportFormatSchema>;
