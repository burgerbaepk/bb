import { PageHeading } from '@/components/admin/PageHeading';
import { ExpenseManager } from '@/components/admin/ExpenseManager';
import { requirePermissionPage } from '@/lib/auth/session';
import { readCurrentBusinessDate } from '@/lib/outlet/queries';
import { readExpenses } from '@/lib/expenses/queries';
import { can } from '@natech/contracts';

export default async function Page() {
  const viewer = await requirePermissionPage('reports.read');
  const today = await readCurrentBusinessDate();
  const from = new Date(`${today}T12:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 89);
  const rows = await readExpenses(from.toISOString().slice(0, 10), today);
  return (
    <>
      <PageHeading
        title="Expenses"
        note="A ninety-day operating expense ledger. Every create and delete is retained in the audit trail."
      />
      <ExpenseManager rows={rows} today={today} canWrite={can(viewer, 'expenses.write')} />
    </>
  );
}
