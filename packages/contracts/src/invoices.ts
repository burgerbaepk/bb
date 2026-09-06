import { z } from 'zod';
import { PaisaSchema, RateBpsSchema } from './money';
import {
  AttemptStatusSchema,
  InvoiceStatusSchema,
  PaymentMethodSchema,
  TaxClassKeySchema,
} from './enums';

/**
 * The tax invoice — BUILD-PLAN.md §5.8, §6.1, §6.12, §7.1, §7.5.
 *
 * This is the document PSTSA s.30(1) governs, and the fields it requires are
 * mandatory here: provider registration number, recipient, description, value
 * exclusive of tax, tax amount, value inclusive of tax. The current receipt
 * prints the NTN alone, which does not satisfy s.30(1)(a) — hence
 * `praRegistrationNo` on the outlet, and defect K5.
 *
 * An invoice carries fiscal marks: `localNo` gap-free from the locked counter,
 * the PRA and FBR numbers once they land, and the QR payload (§7.5). It is
 * immutable after finalize except for those response columns (R5).
 */

export const PaymentSchema = z.object({
  id: z.uuid(),
  method: PaymentMethodSchema,
  amount: PaisaSchema,
  tendered: PaisaSchema.nullable(),
  change: PaisaSchema.nullable(),
  cardLast4: z.string().nullable(),
  terminalRef: z.string().nullable(),
  taxRateAppliedBps: RateBpsSchema.nullable(),
  /**
   * §5.8 — a decline is the event that moves the rate from 8% to 16%, so it is
   * recorded rather than inferred from a gap.
   */
  attemptStatus: AttemptStatusSchema,
  declinedReason: z.string().nullable(),
  at: z.date(),
});
export type Payment = z.infer<typeof PaymentSchema>;

export const InvoiceTaxLineSchema = z.object({
  id: z.uuid(),
  taxClass: TaxClassKeySchema,
  rateBps: RateBpsSchema,
  base: PaisaSchema,
  amount: PaisaSchema,
  /** §6.6 — one row per slice of a split payment. */
  paymentMethodScope: PaymentMethodSchema,
});
export type InvoiceTaxLine = z.infer<typeof InvoiceTaxLineSchema>;

export const InvoiceSchema = z.object({
  id: z.uuid(),
  orderId: z.uuid(),
  /** Gap-free, monotonic, never resets, never reused (§5.8). */
  localNo: z.string().min(1),
  businessDate: z.string(),
  finalizedAt: z.date(),
  finalizedByName: z.string().nullable(),
  terminalLabel: z.string().nullable(),
  status: InvoiceStatusSchema,

  subtotal: PaisaSchema,
  discountTotal: PaisaSchema,
  taxableBase: PaisaSchema,
  taxTotal: PaisaSchema,
  deliveryCharge: PaisaSchema.optional(),
  serviceCharge: PaisaSchema,
  posFee: PaisaSchema,
  roundingAdj: PaisaSchema,
  grandTotal: PaisaSchema,

  taxLines: z.array(InvoiceTaxLineSchema).min(1),
  payments: z.array(PaymentSchema),
  printedCount: z.int().nonnegative(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const CreditNoteSchema = z.object({
  id: z.uuid(),
  invoiceId: z.uuid(),
  invoiceLocalNo: z.string().min(1),
  reason: z.string().min(1),
  amount: PaisaSchema,
  issuedAt: z.date(),
  issuedByName: z.string().nullable(),
});
export type CreditNote = z.infer<typeof CreditNoteSchema>;

/**
 * §6.6 — the payment sheet's working state. One slice per method; a `DECLINED`
 * attempt is recorded but excluded from the tax computation, because the rate
 * follows what was actually collected.
 */
export const PaymentSliceDraftSchema = z.object({
  method: PaymentMethodSchema,
  amount: PaisaSchema,
  attemptStatus: AttemptStatusSchema,
  declinedReason: z.string().nullable(),
});
export type PaymentSliceDraft = z.infer<typeof PaymentSliceDraftSchema>;
