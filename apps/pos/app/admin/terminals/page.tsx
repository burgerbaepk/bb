import { TerminalsManager } from '@/components/admin/TerminalsManager';
import { listTerminals } from '@/lib/terminals/queries';
import { requirePermissionPage } from '@/lib/auth/session';

/**
 * Terminal registration — BUILD-PLAN.md §5.2, §14.6, M08 runfile.
 *
 * §14.1 names no dedicated terminal permission; the M08 runfile's decision is
 * that `pos_terminals` is kin to `users`/`roles` rather than to the menu or
 * the floor, so this is gated on `staff.write` exactly like
 * `app/admin/staff/page.tsx` — `OWNER` only in the seeded roles.
 */
export default async function Page() {
  await requirePermissionPage('staff.write');
  const terminals = await listTerminals();

  return <TerminalsManager terminals={terminals} />;
}
