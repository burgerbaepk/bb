import 'server-only';
import { and, between, eq, isNull } from 'drizzle-orm';
import { dbRead, invoiceTaxLines, invoices, taxClasses } from '@natech/db';
import { paisa, sum, type TaxClassKey } from '@natech/domain';
import type { DateRange, TaxLiabilityRow } from '@natech/contracts';
import { readTaxRules } from '../tax/queries';

/**
 * Tax summary reporting — grouped taxable value and tax collected by rate.
 * M13-reporting.md §3.
 *
 * Split by rate and by the payment method that set it (§6.6 — a split
 * payment contributes a row per method), from `invoice_tax_lines` directly.
 * `legalReference` is looked up from `readTaxRules()` (`lib/tax/queries.ts`,
 * already built for the check/finalize path) by the same
 * `(taxClass, paymentMethod, rateBps)` tuple the invoice's own tax line was
 * struck against, rather than re-deriving it here.
 */
export async function readTaxLiability(range: DateRange): Promise<TaxLiabilityRow[]> {
  const [rows, taxRules] = await Promise.all([
    dbRead()
      .select({
        taxClass: taxClasses.key,
        rateBps: invoiceTaxLines.rateBps,
        method: invoiceTaxLines.paymentMethodScope,
        base: invoiceTaxLines.base,
        amount: invoiceTaxLines.amount,
        invoiceId: invoiceTaxLines.invoiceId,
      })
      .from(invoiceTaxLines)
      .innerJoin(invoices, eq(invoiceTaxLines.invoiceId, invoices.id))
      .leftJoin(taxClasses, eq(invoiceTaxLines.taxClassId, taxClasses.id))
      .where(
        and(
          between(invoices.businessDate, range.fromBusinessDate, range.toBusinessDate),
          isNull(invoiceTaxLines.deletedAt),
          isNull(invoices.deletedAt),
        ),
      ),
    readTaxRules(),
  ]);

  const byGroup = new Map<string, typeof rows>();
  for (const row of rows) {
    if (row.taxClass === null || row.method === null) continue;
    const key = `${row.taxClass}-${row.rateBps}-${row.method}`;
    const existing = byGroup.get(key);
    if (existing === undefined) byGroup.set(key, [row]);
    else existing.push(row);
  }

  return [...byGroup.values()]
    .map((groupRows) => {
      const first = groupRows[0];
      if (first === undefined || first.taxClass === null || first.method === null) {
        throw new Error('unreachable: grouped by a non-null key');
      }
      // A rule with `paymentMethod: null` applies regardless of method (an
      // EXEMPT/ZERO class need not vary by how the customer paid) — tried
      // only once no method-specific rule matches this exact tuple.
      const rule =
        taxRules.find(
          (candidate) =>
            candidate.taxClass === first.taxClass &&
            candidate.paymentMethod === first.method &&
            candidate.rateBps === first.rateBps,
        ) ??
        taxRules.find(
          (candidate) =>
            candidate.taxClass === first.taxClass &&
            candidate.paymentMethod === null &&
            candidate.rateBps === first.rateBps,
        );
      return {
        // `taxClasses.key` is a plain `text` column (no DB enum) — cast the
        // same way `lib/tax/queries.ts`'s own `readTaxRules` already does.
        taxClass: first.taxClass as TaxClassKey,
        rateBps: first.rateBps,
        method: first.method,
        taxableValue: sum(groupRows.map((row) => paisa(row.base))),
        taxCollected: sum(groupRows.map((row) => paisa(row.amount))),
        invoiceCount: new Set(groupRows.map((row) => row.invoiceId)).size,
        legalReference: rule?.legalReference ?? 'PSTSA 2012',
      };
    })
    .sort((a, b) => a.rateBps - b.rateBps);
}
