import { EmployeeManager } from '@/components/admin/EmployeeManager';
import { PageHeading } from '@/components/admin/PageHeading';
import { requirePermissionPage } from '@/lib/auth/session';
import { readEmployees } from '@/lib/attendance/queries';

/**
 * The staff register — ADR 0032, amended by ADR 0037: `expenses.write`, so a
 * manager keeps it as well as the owner. Every addition is an audit row the
 * owner reads in the activity log.
 */
export default async function Page() {
  await requirePermissionPage('expenses.write');
  return (
    <>
      <PageHeading
        title="Employees"
        note="Everyone on the payroll sheet, whether or not they log in to the POS. Logins are managed under Staff and roles."
      />
      <EmployeeManager rows={await readEmployees()} />
    </>
  );
}
