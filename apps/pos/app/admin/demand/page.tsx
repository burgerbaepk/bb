import { PageHeading } from '@/components/admin/PageHeading';
import { DemandSheetList } from '@/components/admin/DemandSheetList';
import { requirePermissionPage } from '@/lib/auth/session';
import { readCurrentBusinessDate } from '@/lib/outlet/queries';
import { readDemandSheets } from '@/lib/demand/queries';
import { can } from '@natech/contracts';

/**
 * Demand order sheets — ADR 0026, docs/runfiles/M23-demand-sheets.md.
 *
 * `reports.read` to see, `expenses.write` to change, the same split
 * `/admin/expenses` uses. An auditor reads every sheet and writes none.
 */
export default async function Page() {
  const viewer = await requirePermissionPage('reports.read');
  const today = await readCurrentBusinessDate();
  // Ninety days back, and thirty forward: unlike an expense, a demand sheet is
  // written for a date that has not happened yet, so a window ending today
  // would hide every sheet the manager is currently working on.
  const from = new Date(`${today}T12:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 89);
  const to = new Date(`${today}T12:00:00Z`);
  to.setUTCDate(to.getUTCDate() + 30);
  const rows = await readDemandSheets(
    from.toISOString().slice(0, 10),
    to.toISOString().slice(0, 10),
  );
  return (
    <>
      <PageHeading
        title="Demand sheets"
        note="What the kitchen needs bought, and by when. A sheet is frozen once submitted; every change is retained in the audit trail. This is a requisition, not a stock system — it records what was asked for, never what is on hand."
      />
      <DemandSheetList rows={rows} today={today} canWrite={can(viewer, 'expenses.write')} />
    </>
  );
}
