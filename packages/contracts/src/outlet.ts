import { z } from 'zod';

/**
 * Outlet identity — BUILD-PLAN.md §5.1, §7.1, §14.3, R12.
 *
 * R12 forbids the restaurant's name, NTN, STRN, address, phone, and brand
 * colour from ever appearing in source. Every surface that prints identity —
 * the tax invoice header, the storefront landing page — takes it as data
 * shaped like this, resolved from `outlet_config`.
 *
 * `praRegistrationNo` remains nullable at the storage/configuration boundary
 * because an outlet can be provisioned before registration is entered. The
 * invoice renderer prints it whenever configured.
 */

export const OutletConfigSchema = z.object({
  legalName: z.string().min(1),
  tradingName: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().nullable(),
  /** Optional operationally; blank values are omitted from receipts. */
  ntn: z.string(),
  strn: z.string().nullable(),
  timezone: z.string().min(1),
  /** §5.8 — `business_date` is stamped against this at finalize. */
  businessDayCutoff: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  storeOpen: z.string().nullable(),
  storeClose: z.string().nullable(),
  weeklyOffDays: z.array(z.string()),
});
export type OutletConfig = z.infer<typeof OutletConfigSchema>;

export const TerminalSchema = z.object({
  id: z.uuid(),
  label: z.string().min(1),
  posType: z.enum(['PRIMARY', 'SECONDARY']),
  isActive: z.boolean(),
});
export type Terminal = z.infer<typeof TerminalSchema>;

/**
 * §12 — all three print paths are built and the active one is selected per
 * terminal in Settings.
 */
export const PrintPathSchema = z.enum(['BRIDGE_AGENT', 'WEB_USB', 'HTML_DIALOG']);
export type PrintPath = z.infer<typeof PrintPathSchema>;

/** §14.4 — the vendor line beneath the operator's footer. */
export const VENDOR_FOOTER_LINE = 'Powered by NA Technologies Ltd';

/** §8 — an invoice finalized while the terminal was offline. */
export const OFFLINE_INVOICE_BANNER = 'OFFLINE RECEIPT';
