import Link from 'next/link';
import {
  ArrowRight,
  ChartPie,
  ClipboardList,
  LayoutGrid,
  Scale,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { PageHeading } from '@/components/admin/PageHeading';
import { requirePermissionPage } from '@/lib/auth/session';

/**
 * The report index — BUILD-PLAN.md §17.
 *
 * Grouped by who asks the question. Trading reports answer "how did we do";
 * the authority-facing pair answers "what do we owe and can you prove it",
 * which is a different reader with different tolerances.
 */
const REPORTS = [
  {
    href: '/admin/reports/sales',
    title: 'Sales',
    note: 'By business date, by item, by category, by channel, and by payment method.',
    icon: TrendingUp,
  },
  {
    href: '/admin/reports/floor',
    title: 'Floor performance',
    note: 'Table turns, dwell by zone and daypart, covers per waiter, revenue per seat-hour, dead-table time.',
    icon: LayoutGrid,
  },
  {
    href: '/admin/reports/shift',
    title: 'Shift X and Z',
    note: 'Cash expected against counted, movements, and check-to-invoice conversion per cashier.',
    icon: ClipboardList,
  },
  {
    href: '/admin/reports/exceptions',
    title: 'Exceptions',
    note: 'Voids, discounts, price overrides, check reprints, abandoned checks, and declined card attempts.',
    icon: ChartPie,
  },
  {
    href: '/admin/reports/tax',
    title: 'Tax summary',
    note: 'Taxable value and tax collected, split by rate, per tax period.',
    icon: Scale,
  },
  {
    href: '/admin/reports/auditor',
    title: 'Auditor access pack',
    note: 'Review and export a summary of records for audit preparation.',
    icon: ShieldCheck,
  },
] as const;

export default async function Page() {
  await requirePermissionPage('reports.read');

  return (
    <>
      <PageHeading
        title="Reports"
        note="Review sales, taxes, shifts, and floor performance. Choose a report to view or export."
      />

      <ul className="grid gap-3 md:grid-cols-2">
        {REPORTS.map((report) => {
          const Icon = report.icon;
          return (
            <li key={report.href}>
              <Link
                href={report.href}
                className="border-border bg-surface-raised hover:border-border-strong flex h-full items-start gap-3 rounded-base border p-4"
              >
                <Icon aria-hidden="true" className="text-ink-subtle mt-0.5 size-5 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{report.title}</span>
                  <span className="text-ink-muted block text-sm">{report.note}</span>
                </span>
                <ArrowRight aria-hidden="true" className="text-ink-subtle mt-0.5 size-4 shrink-0" />
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
