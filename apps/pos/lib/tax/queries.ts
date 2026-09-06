import 'server-only';
import { eq, isNull } from 'drizzle-orm';
import { dbRead, settings, taxClasses, taxRules } from '@natech/db';
import {
  DEFAULT_TAX_POLICY,
  paisa,
  type OrderType,
  type TaxClassKey,
  type TaxPolicy,
  type TaxRule,
} from '@natech/domain';
import type { PrintPath } from '@natech/contracts';

/**
 * Real tax policy and tax rules — BUILD-PLAN.md §5.10, §6.7, §6.8;
 * docs/runfiles/M10-check-and-payment.md §2.
 *
 * `packages/db/seeds/tax.ts` writes `tax.policy` as one JSON blob under
 * `settings`, mirroring `apps/pos/lib/branding/queries.ts`'s
 * `readBrandConfig()` — the same "one settings row, one JSON blob, parsed with
 * a safe fallback" shape, not the granular per-field key list
 * `packages/contracts/mocks/settings.ts` uses for its Phase-1 admin-editor
 * mock (that file is UI groundwork for an editor no milestone has wired yet —
 * see this runfile's §2 "Out" — and is not the real row shape).
 *
 * `posFeePaisa` round-trips through jsonb as a string (ADR 0008 — money never
 * crosses a boundary as a JSON number), so it is parsed back into a `Paisa`
 * here, the one place a settings read becomes a domain value.
 */

const TAX_POLICY_KEY = 'tax.policy';
const PRINT_PATH_KEY = 'print.activePath';
const DEFAULT_PRINT_PATH: PrintPath = 'HTML_DIALOG';

async function readSettingValue(key: string): Promise<unknown> {
  const rows = await dbRead()
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  return rows[0]?.value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Falls back to `DEFAULT_TAX_POLICY` if the row is missing or malformed. */
export async function readTaxPolicy(): Promise<TaxPolicy> {
  const value = await readSettingValue(TAX_POLICY_KEY);
  if (!isRecord(value)) return DEFAULT_TAX_POLICY;
  const serviceChargeEnabled =
    typeof value['serviceChargeEnabled'] === 'boolean' ? value['serviceChargeEnabled'] : true;

  const posFeePaisa =
    typeof value['posFeePaisa'] === 'string'
      ? paisa(BigInt(value['posFeePaisa']))
      : DEFAULT_TAX_POLICY.posFeePaisa;

  return {
    taxEnabled: typeof value['taxEnabled'] === 'boolean' ? value['taxEnabled'] : true,
    serviceChargeBps:
      typeof value['serviceChargeBps'] === 'number'
        ? value['serviceChargeBps']
        : DEFAULT_TAX_POLICY.serviceChargeBps,
    serviceChargeTaxable:
      typeof value['serviceChargeTaxable'] === 'boolean'
        ? value['serviceChargeTaxable']
        : DEFAULT_TAX_POLICY.serviceChargeTaxable,
    // Service charge is a dine-in charge only. Ignore stale settings that may
    // have included takeaway or delivery in the past.
    serviceChargeAppliesTo: serviceChargeEnabled ? ['DINE_IN'] : [],
    posFeePaisa,
    posFeeTaxable:
      typeof value['posFeeTaxable'] === 'boolean'
        ? value['posFeeTaxable']
        : DEFAULT_TAX_POLICY.posFeeTaxable,
    splitPaymentTaxPolicy:
      typeof value['splitPaymentTaxPolicy'] === 'string'
        ? (value['splitPaymentTaxPolicy'] as TaxPolicy['splitPaymentTaxPolicy'])
        : DEFAULT_TAX_POLICY.splitPaymentTaxPolicy,
    discountBeforeTax:
      typeof value['discountBeforeTax'] === 'boolean'
        ? value['discountBeforeTax']
        : DEFAULT_TAX_POLICY.discountBeforeTax,
    rounding:
      typeof value['rounding'] === 'string'
        ? (value['rounding'] as TaxPolicy['rounding'])
        : DEFAULT_TAX_POLICY.rounding,
    roundingDirection:
      typeof value['roundingDirection'] === 'string'
        ? (value['roundingDirection'] as TaxPolicy['roundingDirection'])
        : DEFAULT_TAX_POLICY.roundingDirection,
  };
}

export interface ServiceChargeSettings {
  readonly taxEnabled: boolean;
  readonly enabled: boolean;
  readonly defaultBps: number;
  readonly posFeeEnabled: boolean;
}

/** Admin-facing values preserve the configured rate even while charging is disabled. */
export async function readServiceChargeSettings(): Promise<ServiceChargeSettings> {
  const value = await readSettingValue(TAX_POLICY_KEY);
  if (!isRecord(value)) {
    return {
      taxEnabled: true,
      enabled: true,
      defaultBps: DEFAULT_TAX_POLICY.serviceChargeBps,
      posFeeEnabled: true,
    };
  }
  return {
    taxEnabled: typeof value['taxEnabled'] === 'boolean' ? value['taxEnabled'] : true,
    enabled:
      typeof value['serviceChargeEnabled'] === 'boolean' ? value['serviceChargeEnabled'] : true,
    defaultBps:
      typeof value['serviceChargeBps'] === 'number'
        ? value['serviceChargeBps']
        : DEFAULT_TAX_POLICY.serviceChargeBps,
    posFeeEnabled: typeof value['posFeeEnabled'] === 'boolean' ? value['posFeeEnabled'] : true,
  };
}

/** Apply a persisted per-order rate without mutating the outlet policy object. */
export function withServiceChargeOverride(
  policy: TaxPolicy,
  overrideBps: number | null,
  orderType: OrderType,
): TaxPolicy {
  if (orderType !== 'DINE_IN') return { ...policy, serviceChargeAppliesTo: [] };
  // The outlet-wide off switch is authoritative over stale per-order overrides.
  if (!policy.serviceChargeAppliesTo.includes('DINE_IN')) return policy;
  if (overrideBps === null) return policy;
  return {
    ...policy,
    serviceChargeBps: overrideBps,
    serviceChargeAppliesTo: overrideBps === 0 ? [] : ['DINE_IN'],
  };
}

/** §12 — the print path every terminal uses; see this runfile's §3 on why it is one global setting. */
export async function readActivePrintPath(): Promise<PrintPath> {
  const value = await readSettingValue(PRINT_PATH_KEY);
  return value === 'BRIDGE_AGENT' || value === 'WEB_USB' || value === 'HTML_DIALOG'
    ? value
    : DEFAULT_PRINT_PATH;
}

/** §5.10, §6.7 — resolved against `orders.service_started_at` by `resolveRate`, never read time. */
export async function readTaxRules(): Promise<readonly TaxRule[]> {
  const rows = await dbRead()
    .select({
      key: taxClasses.key,
      paymentMethod: taxRules.paymentMethod,
      rateBps: taxRules.rateBps,
      effectiveFrom: taxRules.effectiveFrom,
      effectiveTo: taxRules.effectiveTo,
      legalReference: taxRules.legalReference,
    })
    .from(taxRules)
    .innerJoin(taxClasses, eq(taxRules.taxClassId, taxClasses.id))
    .where(isNull(taxRules.deletedAt));

  return rows.map((row): TaxRule => ({
    taxClass: row.key as TaxClassKey,
    paymentMethod: row.paymentMethod,
    rateBps: row.rateBps,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    legalReference: row.legalReference ?? undefined,
  }));
}
