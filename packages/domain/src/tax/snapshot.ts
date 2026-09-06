import type { Totals } from './engine';
import type { TaxPolicy } from './policy';

/**
 * The tax snapshot — BUILD-PLAN.md §6.12.
 *
 * Written to `invoices.tax_snapshot` at finalize and never touched again: R5
 * makes it immutable, and the trigger added in M02 enforces that.
 *
 * It exists so that an invoice can be explained years later. PSTSA s.32(1)
 * requires six years of retention, and by then the rules table will have moved
 * on. Without the snapshot, reconstructing why a 2026 invoice was taxed at 8%
 * means guessing at what the rules said at the time.
 */
export const ENGINE_VERSION = '1.1.0';

export interface SnapshotRule {
  readonly class: string;
  readonly method: string;
  readonly rateBps: number;
  readonly effectiveFrom: string;
  readonly legalRef?: string | undefined;
}

export interface TaxSnapshot {
  readonly engineVersion: string;
  readonly resolvedAt: string;
  /** Always this. §6.7, PSTSA s.13 — the rate in force when service was provided. */
  readonly resolvedAgainst: 'service_started_at';
  readonly serviceStartedAt: string;
  readonly rules: readonly SnapshotRule[];
  readonly policy: {
    readonly taxEnabled: boolean;
    readonly serviceChargeBps: number;
    readonly serviceChargeTaxable: boolean;
    readonly posFeePaisa: string;
    readonly splitPaymentTaxPolicy: string;
    readonly discountBeforeTax: boolean;
    readonly rounding: string;
    readonly roundingDirection: string;
  };
}

export function buildTaxSnapshot(
  totals: Totals,
  policy: TaxPolicy,
  serviceStartedAt: Date,
  resolvedAt: Date,
): TaxSnapshot {
  const seen = new Set<string>();
  const rules: SnapshotRule[] = [];

  for (const line of totals.taxLines) {
    const key = `${line.taxClass}|${line.paymentMethodScope}|${line.rateBps}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rules.push({
      class: line.taxClass,
      method: line.paymentMethodScope,
      rateBps: line.rateBps,
      effectiveFrom: serviceStartedAt.toISOString(),
      legalRef: line.legalReference,
    });
  }

  return {
    engineVersion: ENGINE_VERSION,
    resolvedAt: resolvedAt.toISOString(),
    resolvedAgainst: 'service_started_at',
    serviceStartedAt: serviceStartedAt.toISOString(),
    rules,
    // posFeePaisa is a string: JSON has no bigint, and rendering money through
    // a JSON number is exactly the float exposure R1 exists to prevent.
    policy: {
      taxEnabled: policy.taxEnabled,
      serviceChargeBps: policy.serviceChargeBps,
      serviceChargeTaxable: policy.serviceChargeTaxable,
      posFeePaisa: policy.posFeePaisa.toString(),
      splitPaymentTaxPolicy: policy.splitPaymentTaxPolicy,
      discountBeforeTax: policy.discountBeforeTax,
      rounding: policy.rounding,
      roundingDirection: policy.roundingDirection,
    },
  };
}
