import type { Metadata } from 'next';
import { ToastProvider } from '@natech/ui';
import { AdminShell } from '@/components/admin/AdminShell';
import { canUseAssistant } from '@/lib/assistant/access';
import { requireOperator } from '@/lib/auth/session';

/**
 * The back office — BUILD-PLAN.md §3, §18 M05, §14.1 (M07).
 *
 * The actor here is the **account that bound the terminal**, not the PIN at the
 * till. §14.2 puts the PIN on "till actions": the person changing a tax rate
 * signed in with a password minutes ago, and asking them for four digits on top
 * would be weaker, not stronger.
 *
 * The layout proves there is a live account with a role via `requireOperator()`.
 * What each screen needs beyond that is checked by the screen —
 * `staff.write` for staff and `settings.tax.write` for the tax policy—and again
 * inside every action, which is the check that counts (§14.1).
 */
export const metadata: Metadata = {
  title: 'Back office',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const operator = await requireOperator();

  return (
    <ToastProvider>
      <AdminShell
        viewerName={operator.displayName}
        viewerRole={operator.role}
        permissions={operator.permissions}
        assistant={canUseAssistant(operator.role)}
      >
        {children}
      </AdminShell>
    </ToastProvider>
  );
}
