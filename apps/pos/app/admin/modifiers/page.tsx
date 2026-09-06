import { ModifierBuilder } from '@/components/admin/ModifierBuilder';
import { requirePermissionPage } from '@/lib/auth/session';
import { listModifierGroups } from '@/lib/menu/queries';

/** Modifier builder — BUILD-PLAN.md §5.3, §10.1; M08 runfile. */
export default async function Page() {
  await requirePermissionPage('menu.write');
  const groups = await listModifierGroups();
  return <ModifierBuilder groups={groups} />;
}
