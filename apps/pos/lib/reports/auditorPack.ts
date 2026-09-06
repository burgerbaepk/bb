import 'server-only';
import { and, between, count, eq, isNull } from 'drizzle-orm';
import { auditLog, creditNotes, dbRead, invoiceTaxLines, invoices, payments } from '@natech/db';
import { paisa, sum } from '@natech/domain';
import type { AuditorPack, DateRange } from '@natech/contracts';

/**
 * The s.32(2) access pack — BUILD-PLAN.md §17, PSTSA s.32(1)/s.32(2);
 * docs/runfiles/M13-reporting.md §3.
 *
 * `AuditorPackSchema` carries summary counts and a `contents` manifest, not
 * row-level data — this is a summary of what an access pack contains, and its
 * export (via `ReportShell`, same as every other report) serialises that
 * manifest, not a bulk multi-table dump. `retentionUntil` is six years past
 * the end of the financial year the range's own end falls in (s.32(1)); this
 * codebase's financial year is the calendar year (no fiscal-year-start
 * setting exists to say otherwise).
 */
function retentionUntil(toBusinessDate: string): string {
  const year = Number(toBusinessDate.slice(0, 4));
  return `${year + 6}-12-31`;
}

export async function readAuditorPack(range: DateRange): Promise<AuditorPack> {
  const invoiceWindow = and(
    between(invoices.businessDate, range.fromBusinessDate, range.toBusinessDate),
    isNull(invoices.deletedAt),
  );

  const [invoiceRows, taxLineCount, paymentCount, creditNoteRows, auditCount] = await Promise.all([
    dbRead().select({ taxTotal: invoices.taxTotal }).from(invoices).where(invoiceWindow),
    dbRead()
      .select({ total: count() })
      .from(invoiceTaxLines)
      .innerJoin(invoices, eq(invoiceTaxLines.invoiceId, invoices.id))
      .where(and(invoiceWindow, isNull(invoiceTaxLines.deletedAt)))
      .then((rows) => rows[0]?.total ?? 0),
    dbRead()
      .select({ total: count() })
      .from(payments)
      .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
      .where(and(invoiceWindow, isNull(payments.deletedAt)))
      .then((rows) => rows[0]?.total ?? 0),
    dbRead()
      .select({ amount: creditNotes.amount })
      .from(creditNotes)
      .innerJoin(invoices, eq(creditNotes.invoiceId, invoices.id))
      .where(and(invoiceWindow, isNull(creditNotes.deletedAt))),
    dbRead()
      .select({ total: count() })
      .from(auditLog)
      .where(
        and(
          between(
            auditLog.at,
            new Date(`${range.fromBusinessDate}T00:00:00Z`),
            new Date(`${range.toBusinessDate}T23:59:59.999Z`),
          ),
        ),
      )
      .then((rows) => rows[0]?.total ?? 0),
  ]);

  return {
    range,
    invoiceCount: invoiceRows.length,
    creditNoteCount: creditNoteRows.length,
    taxCollected: sum(invoiceRows.map((row) => paisa(row.taxTotal))),
    generatedAt: new Date(),
    retentionUntil: retentionUntil(range.toBusinessDate),
    contents: [
      { label: 'Invoices', rowCount: invoiceRows.length },
      { label: 'Invoice tax lines', rowCount: taxLineCount },
      { label: 'Payments', rowCount: paymentCount },
      { label: 'Credit notes', rowCount: creditNoteRows.length },
      { label: 'Audit rows', rowCount: auditCount },
    ],
  };
}
