import Link from 'next/link';
import { ListChecks } from 'lucide-react';
import { can } from '@natech/contracts';
import { PageHeading } from '@/components/admin/PageHeading';
import { StockBook } from '@/components/admin/StockBook';
import { requirePermissionPage } from '@/lib/auth/session';
import { readCurrentBusinessDate } from '@/lib/outlet/queries';
import { readStock } from '@/lib/stock/queries';

/**
 * The stock book — ADR 0034. `reports.read` to read; every write needs
 * `expenses.write`, checked again in the action.
 */
export default async function Page() {
  const viewer = await requirePermissionPage('reports.read');
  const canWrite = can(viewer, 'expenses.write');
  const [rows, today] = await Promise.all([readStock(), readCurrentBusinessDate()]);
  return (
    <>
      <PageHeading
        title="Stock"
        note="What the book says is on the shelf: deliveries in, issues to the kitchen, waste, and physical counts. It is not linked to sales — nothing leaves stock when a burger is sold — so count regularly."
        actions={
          canWrite ? (
            <Link
              href="/admin/stock/count"
              className="border-border bg-surface inline-flex min-h-touch items-center gap-2 rounded-base border px-4 text-sm font-medium"
            >
              <ListChecks aria-hidden="true" className="size-4" />
              Count sheet
            </Link>
          ) : undefined
        }
      />
      <StockBook rows={rows} today={today} canWrite={canWrite} />
    </>
  );
}
