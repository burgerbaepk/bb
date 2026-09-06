import { z } from 'zod';
import { PaisaWireSchema, RateBpsSchema } from './money';
import { OrderTypeSchema, PaymentMethodSchema, PermissionSchema } from './enums';

/**
 * The settings registry — BUILD-PLAN.md §5.10, §6.8, §13.3, §14.2.
 *
 * `settings` is a key/jsonb table, and a key/jsonb table with a hand-built form
 * per key drifts the moment somebody adds a key and forgets the form. So the
 * registry is data: each entry declares its type, its group, the permission
 * required to write it, and its audit level, and one renderer draws all of them.
 *
 * §6.8 puts `tax.policy` behind `settings.tax.write` at audit level HIGH. It
 * decides what a customer is charged, so a change is written to
 * `setting_history` with actor and reason (§5.10).
 */

export const SettingKindSchema = z.enum([
  'BOOLEAN',
  'INTEGER',
  'BPS',
  'MONEY',
  'TEXT',
  'TEXT_LIST',
  'ENUM',
  'ENUM_LIST',
  'TIME',
]);
export type SettingKind = z.infer<typeof SettingKindSchema>;

export const AuditLevelSchema = z.enum(['LOW', 'NORMAL', 'HIGH']);
export type AuditLevel = z.infer<typeof AuditLevelSchema>;

export const SettingGroupSchema = z.enum(['TAX', 'PRINTING', 'FLOOR', 'STOREFRONT', 'SECURITY']);
export type SettingGroup = z.infer<typeof SettingGroupSchema>;

export const SettingDefinitionSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  /** Why it exists and what breaks if it is wrong. Rendered under the control. */
  help: z.string().min(1),
  group: SettingGroupSchema,
  kind: SettingKindSchema,
  /** Populated for ENUM and ENUM_LIST. */
  options: z.array(z.object({ value: z.string(), label: z.string() })),
  permission: PermissionSchema,
  auditLevel: AuditLevelSchema,
  /** The clause this setting implements, shown beside a HIGH-audit control. */
  legalReference: z.string().nullable(),
});
export type SettingDefinition = z.infer<typeof SettingDefinitionSchema>;

export const SettingValueSchema = z.object({
  key: z.string().min(1),
  value: z.union([z.string(), z.boolean(), z.number(), z.array(z.string())]),
  updatedAt: z.date().nullable(),
  updatedByName: z.string().nullable(),
});
export type SettingValue = z.infer<typeof SettingValueSchema>;

export const SettingHistoryEntrySchema = z.object({
  id: z.uuid(),
  key: z.string().min(1),
  before: z.string(),
  after: z.string(),
  actorName: z.string().min(1),
  reason: z.string().nullable(),
  at: z.date(),
});
export type SettingHistoryEntry = z.infer<typeof SettingHistoryEntrySchema>;

/** §6.8 — typed rather than left as loose jsonb, because the engine takes it. */
export const TaxPolicySettingSchema = z.object({
  serviceChargeEnabled: z.boolean().default(true),
  serviceChargeBps: RateBpsSchema,
  serviceChargeTaxable: z.boolean(),
  serviceChargeAppliesTo: z.array(OrderTypeSchema),
  posFeePaisa: PaisaWireSchema,
  posFeeTaxable: z.boolean(),
  splitPaymentTaxPolicy: z.enum(['PROPORTIONAL', 'HIGHEST_RATE', 'PRIMARY_METHOD']),
  discountBeforeTax: z.boolean(),
  rounding: z.enum(['NONE', 'NEAREST_RUPEE', 'NEAREST_5_RUPEE']),
  roundingDirection: z.enum(['HALF_UP', 'UP', 'DOWN']),
});
export type TaxPolicySetting = z.infer<typeof TaxPolicySettingSchema>;

export const TaxRuleRowSchema = z.object({
  id: z.uuid(),
  taxClass: z.string().min(1),
  paymentMethod: PaymentMethodSchema.nullable(),
  rateBps: RateBpsSchema,
  effectiveFrom: z.date(),
  effectiveTo: z.date().nullable(),
  /** §5.10 — a rate without its statutory basis is unauditable. */
  legalReference: z.string().min(1),
});
export type TaxRuleRow = z.infer<typeof TaxRuleRowSchema>;
