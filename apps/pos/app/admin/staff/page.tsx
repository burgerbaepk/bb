import { StaffManager } from '@/components/admin/StaffManager';
import { listRoles, listStaff } from '@/lib/auth/queries';
import { requirePermissionPage } from '@/lib/auth/session';

/**
 * Staff and roles — BUILD-PLAN.md §14.1, §14.2.
 *
 * §14.1 gives user management to `OWNER` alone, which `staff.write` expresses.
 * The check here decides whether the screen renders; every action re-checks it,
 * because that is the check an attacker has to get past.
 */
export default async function Page() {
  const operator = await requirePermissionPage('staff.write');
  const [staff, roles] = await Promise.all([listStaff(), listRoles()]);

  return <StaffManager staff={staff} roles={roles} currentUserId={operator.id} />;
}
