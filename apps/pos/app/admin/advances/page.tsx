import { can } from '@natech/contracts';
import { AdvanceLedger } from '@/components/admin/AdvanceLedger';
import { PageHeading } from '@/components/admin/PageHeading';
import { requirePermissionPage } from '@/lib/auth/session';
import { readAdvanceBalances, readAdvanceEntries } from '@/lib/advances/queries';
import { readCurrentBusinessDate } from '@/lib/outlet/queries';
import { readOpenShift } from '@/lib/shifts/queries';

/**
 * The staff advance book — ADR 0033. `reports.read` to read; the entry needs
 * `expenses.write`, checked again in the action.
 */
export default async function Page() {
  const viewer = await requirePermissionPage('reports.read');
  const today = await readCurrentBusinessDate();
  const from = new Date(`${today}T12:00:00Z`);
  from.setUTCDate(from.getUTCDate() - 89);
  const [people, entries, shift] = await Promise.all([
    readAdvanceBalances(),
    readAdvanceEntries(from.toISOString().slice(0, 10)),
    readOpenShift(),
  ]);
  return (
    <>
      <PageHeading
        title="Advances"
        note="Money advanced to staff against their pay, and what has come back. An advance is not an expense — it is owed to the restaurant — so it does not appear in the expense ledger. Cash through the till also appears on the shift."
      />
      <AdvanceLedger
        people={people}
        entries={entries}
        today={today}
        shiftOpen={shift !== null}
        canWrite={can(viewer, 'expenses.write')}
      />
    </>
  );
}
