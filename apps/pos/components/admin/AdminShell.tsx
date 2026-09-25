'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChartNoAxesColumn,
  ClipboardList,
  CalendarCheck,
  HandCoins,
  Package,
  IdCard,
  House,
  ArrowLeft,
  LayoutGrid,
  MonitorSmartphone,
  ReceiptText,
  ScrollText,
  QrCode,
  SlidersHorizontal,
  Wallet,
  BanknoteArrowDown,
  UsersRound,
  UtensilsCrossed,
  LogOut,
  Store,
} from 'lucide-react';
import { Button, IconButton, cn } from '@natech/ui';
import type { ReactNode } from 'react';
import type { Permission } from '@natech/contracts';
import { signOutAction } from '@/lib/auth/actions/session';
import { AssistantPanel } from './AssistantPanel';

/**
 * The back office chrome — BUILD-PLAN.md §14.1, §18 M05.
 *
 * Grouped by who uses it rather than by table: a manager lives in Menu, Floor,
 * and Reports; an owner adds Settings; an auditor only ever needs invoices,
 * reports, and read-only settings. Every entry is still checked server-side (§14.1) —
 * hiding a link is cosmetic — but a nav that offers an auditor the branding
 * editor teaches them the product is not to be trusted about permissions.
 *
 * M07 made each entry declare the permission it needs, and the nav renders only
 * what the account actually holds. A whole
 * section with nothing visible in it disappears rather than sitting empty.
 */
const SECTIONS = [
  {
    heading: 'Overview',
    items: [{ href: '/admin', label: 'Dashboard', icon: House, needs: 'reports.read' }],
  },
  {
    heading: 'Service',
    items: [
      { href: '/admin/menu', label: 'Menu', icon: UtensilsCrossed, needs: 'menu.write' },
      {
        href: '/admin/modifiers',
        label: 'Modifiers',
        icon: SlidersHorizontal,
        needs: 'menu.write',
      },
      { href: '/admin/floor', label: 'Floor plan', icon: LayoutGrid, needs: 'floor.write' },
      { href: '/admin/table-qr', label: 'Table QR codes', icon: QrCode, needs: 'floor.write' },
    ],
  },
  {
    // ADR 0032 — the attendance book is the manager's; the register of people
    // it is kept against is the owner's, so the one who marks cannot invent.
    heading: 'People',
    items: [
      {
        href: '/admin/attendance',
        label: 'Attendance',
        icon: CalendarCheck,
        needs: 'reports.read',
      },
      // ADR 0033 — the advance book. Not under Expenses: an advance is owed back.
      { href: '/admin/advances', label: 'Advances', icon: HandCoins, needs: 'reports.read' },
      { href: '/admin/employees', label: 'Employees', icon: IdCard, needs: 'staff.write' },
    ],
  },
  {
    heading: 'Control',
    items: [
      { href: '/admin/staff', label: 'Staff and roles', icon: UsersRound, needs: 'staff.write' },
      {
        href: '/admin/terminals',
        label: 'Terminals',
        icon: MonitorSmartphone,
        needs: 'staff.write',
      },
      {
        href: '/admin/settings',
        label: 'Settings',
        icon: SlidersHorizontal,
        needs: 'settings.read',
      },
    ],
  },
  {
    heading: 'Oversight',
    items: [
      { href: '/admin/shift', label: 'Shift management', icon: Wallet, needs: 'shift.close' },
      {
        href: '/admin/expenses',
        label: 'Expenses',
        icon: BanknoteArrowDown,
        needs: 'reports.read',
      },
      {
        href: '/admin/demand',
        label: 'Demand sheets',
        icon: ClipboardList,
        needs: 'reports.read',
      },
      // ADR 0034 — beside Demand sheets: the same item list, a different question.
      { href: '/admin/stock', label: 'Stock', icon: Package, needs: 'reports.read' },
      { href: '/admin/invoices', label: 'Invoices', icon: ReceiptText, needs: 'reports.read' },
      // ADR 0027 — the R7 audit trail has existed since M02 with no reader.
      // ADR 0030 — owner-only; a manager is who it watches.
      { href: '/admin/activity', label: 'Activity log', icon: ScrollText, needs: 'audit.read' },
      { href: '/admin/reports', label: 'Reports', icon: ChartNoAxesColumn, needs: 'reports.read' },
    ],
  },
] as const satisfies ReadonlyArray<{
  heading: string;
  items: ReadonlyArray<{ href: string; label: string; icon: typeof UsersRound; needs: Permission }>;
}>;

export interface AdminShellProps {
  readonly viewerName: string;
  readonly viewerRole: string;
  /** §14.1 — what this account actually holds. Hiding a link is cosmetic. */
  readonly permissions: readonly Permission[];
  /** ADR 0031 — owner and manager only. The action checks again. */
  readonly assistant: boolean;
  readonly children: ReactNode;
}

export function AdminShell({
  viewerName,
  viewerRole,
  permissions,
  assistant,
  children,
}: AdminShellProps) {
  const pathname = usePathname();
  const held = new Set<Permission>(permissions);

  return (
    <div className="bg-surface text-ink min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      {/* ADR 0020 — the rail sits on the page ground rather than on a raised
          panel. Elevation now means "this is a card of content"; spending it on
          the chrome as well left every screen reading as two competing panels
          with the actual work in the quieter one. */}
      <aside className="border-border bg-surface border-b lg:sticky lg:top-0 lg:flex lg:h-dvh lg:min-h-0 lg:flex-col lg:overflow-hidden lg:border-b-0 lg:border-e">
        <div className="border-border flex shrink-0 flex-col gap-2 border-b px-4 py-4">
          <Link href="/admin" className="flex min-h-touch items-center gap-2">
            <span className="bg-primary text-primary-ink flex size-7 shrink-0 items-center justify-center rounded-sm">
              <Store aria-hidden="true" className="size-4" />
            </span>
            {/* R12 — a neutral label. The trading name is deployment data and
                never appears in source. */}
            <span className="whitespace-nowrap text-sm font-semibold">Back office</span>
          </Link>
          <Link
            href="/"
            className="text-ink-muted hover:bg-surface-sunken hover:text-ink min-h-touch flex items-center gap-2 rounded-sm px-2 text-sm font-medium"
          >
            <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
            Back to the till
          </Link>
        </div>

        <nav
          aria-label="Back office"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-3"
        >
          {SECTIONS.map((section) => {
            const visible = section.items.filter((item) => held.has(item.needs));
            if (visible.length === 0) return null;
            return (
              <div key={section.heading} className="mb-3">
                <h2 className="text-ink-subtle mb-1 px-2 text-2xs font-medium">
                  {section.heading}
                </h2>
                <ul className="flex flex-wrap gap-0.5 lg:block">
                  {visible.map((item) => {
                    const active =
                      pathname === item.href ||
                      (item.href !== '/admin' && pathname.startsWith(`${item.href}/`));
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            // §14.2 keeps the 44px target even here: the back
                            // office is worked on a tablet often enough that a
                            // desktop-density rail would be the wrong trade.
                            'min-h-touch flex items-center gap-2.5 rounded-sm px-2.5 text-sm',
                            active
                              ? 'bg-surface-sunken text-ink font-medium'
                              : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
                          )}
                        >
                          <Icon aria-hidden="true" className="size-4 shrink-0" />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* Who is signed in, and the way out, at the foot of the rail rather
            than in the header. The header is where a screen names itself; an
            identity parked there competes with the page title on every page. */}
        <div className="border-border hidden shrink-0 items-center gap-2.5 border-t px-3 py-3 lg:flex">
          <span className="bg-surface-sunken text-ink-muted flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
            {viewerName.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{viewerName}</span>
            <span className="text-ink-subtle block truncate text-xs">{viewerRole}</span>
          </span>
          <form action={signOutAction}>
            <IconButton
              icon={LogOut}
              label="Sign out terminal"
              size="sm"
              tone="ghost"
              type="submit"
            />
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* The narrow-screen counterpart of the rail footer. Below `lg` the rail
            is a wrapped strip with no room for it. */}
        <header className="border-border flex items-center gap-3 border-b px-4 py-2.5 lg:hidden">
          <span className="text-ink-muted min-w-0 flex-1 truncate text-sm">
            {viewerName} · {viewerRole}
          </span>
          <form action={signOutAction}>
            <Button size="sm" tone="ghost" icon={LogOut} type="submit">
              Sign out
            </Button>
          </form>
        </header>

        <main className="min-w-0 flex-1 p-4 lg:p-6">{children}</main>
      </div>

      {assistant ? <AssistantPanel /> : null}
    </div>
  );
}
