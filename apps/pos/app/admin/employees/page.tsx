import { EmployeeManager } from '@/components/admin/EmployeeManager';
import { PageHeading } from '@/components/admin/PageHeading';
import { requirePermissionPage } from '@/lib/auth/session';
import { readEmployees } from '@/lib/attendance/queries';

/**
 * The staff register — ADR 0032. `staff.write`, owner-only, like
 * `/admin/staff`: the person who pays an advance (M27) must not also be the
 * person who can create the employee it is paid to.
 */
export default async function Page() {
  await requirePermissionPage('staff.write');
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
