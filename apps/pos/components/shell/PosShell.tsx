'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ChefHat,
  Grid3x3,
  LayoutGrid,
  Lock,
  LockOpen,
  LogOut,
  Settings2,
  Globe,
  Wallet,
} from 'lucide-react';
import { Button, OfflineBanner, StatusPill, cn } from '@natech/ui';
import type { ReactNode } from 'react';
import { lockAction, signOutAction } from '@/lib/auth/actions/session';
import { OfflineProvider, useOffline } from '@/lib/offline/OfflineProvider';

/**
 * The POS chrome — BUILD-PLAN.md §8, §11.1, §14.2.
 *
 * Three things live here because they must be true on every till screen.
 *
 * §11.1 requires a persistent `Active Orders` entry badged with the open-order
 * count, reachable from anywhere. A cashier asked "what's on table nine" should
 * never have to find their way back to a home screen first.
 *
 * §8 requires a persistent offline banner showing queue depth and time since
 * last sync. Not a vague "offline" — the real numbers, because the decision a
 * cashier makes differs at two queued orders and at two hundred.
 *
 * §14.2 puts the bound terminal and the identified staff member on screen at
 * all times. A shared till with fast cashier switching is only safe if whose
 * PIN is active is visible.
 */
export interface PosShellProps {
  readonly activeOrderCount: number;
  readonly webOrderCount: number;
  /** §5.9 — whether a till shift is currently open; docs/runfiles/M12-shifts.md. */
  readonly shiftOpen: boolean;
  readonly terminalId: string;
  readonly terminalLabel: string;
  /** Null while the till is locked — §14.2 identification, not the binding. */
  readonly viewerName: string | null;
  readonly viewerRole: string | null;
  readonly canOpenBackOffice: boolean;
  readonly canManageStaff?: boolean;
  readonly children: ReactNode;
}

const NAV = [
  { href: '/', label: 'Order', icon: Grid3x3 },
  { href: '/floor', label: 'Floor', icon: LayoutGrid },
  { href: '/orders', label: 'Active orders', icon: ChefHat },
  { href: '/web-orders', label: 'Web orders', icon: Globe },
  { href: '/shift', label: 'Shift', icon: Wallet },
] as const;

/**
 * M16 — real offline state, from `useOffline()` (`lib/offline/OfflineProvider.tsx`),
 * replacing the Phase-1 `SIMULATED_OFFLINE` switch this file used to carry:
 * "Phase 1 has no service worker and no queue, so the offline state cannot
 * occur on its own ... M16 replaces the switch with the real thing."
 */
export function PosShell(props: PosShellProps) {
  return (
    <OfflineProvider terminalId={props.terminalId} terminalLabel={props.terminalLabel}>
      <PosShellChrome {...props} />
    </OfflineProvider>
  );
}

function PosShellChrome({
  activeOrderCount,
  webOrderCount,
  shiftOpen,
  terminalLabel,
  viewerName,
  viewerRole,
  canOpenBackOffice,
  canManageStaff = false,
  children,
}: PosShellProps) {
  const pathname = usePathname();
  const { state: connection } = useOffline();

  const badgeFor = (href: string): number | null => {
    if (href === '/orders') return activeOrderCount;
    if (href === '/web-orders') return webOrderCount;
    return null;
  };

  return (
    <div className="bg-surface text-ink flex min-h-dvh flex-col">
      {!connection.online && (
        <OfflineBanner
          queuedOrders={connection.queuedOrders}
          secondsSinceLastSync={connection.secondsSinceLastSync}
        />
      )}

      <header className="border-border bg-surface-raised sticky top-0 z-30 flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2 shadow-sm">
        <nav aria-label="Terminal" className="flex flex-wrap items-center gap-1">
          {NAV.filter((entry) => shiftOpen || entry.href === '/shift').map((entry) => {
            const active = pathname === entry.href;
            const badge = badgeFor(entry.href);
            const Icon = entry.icon;
            return (
              <Link
                key={entry.href}
                href={entry.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'min-h-touch inline-flex items-center gap-2 rounded-base border px-3 py-2 text-sm font-medium transition-colors duration-150',
                  active
                    ? 'bg-primary text-primary-ink border-primary shadow-sm'
                    : 'border-transparent text-ink-muted hover:bg-surface-sunken hover:text-ink',
                )}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span>{entry.label}</span>
                {badge !== null && badge > 0 && (
                  <span
                    className={cn(
                      'rounded-full px-1.5 text-xs font-semibold tabular-nums',
                      active ? 'bg-primary-ink/20' : 'bg-info-soft text-info',
                    )}
                  >
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-border ms-auto flex items-center gap-3 ps-3 sm:border-s">
          <StatusPill label={terminalLabel} icon={Settings2} tone="neutral" size="sm" />
          <StatusPill
            label={shiftOpen ? 'Shift open' : 'Shift closed'}
            icon={shiftOpen ? LockOpen : Lock}
            tone={shiftOpen ? 'ok' : 'neutral'}
            size="sm"
          />

          {/*
            §14.2 puts the bound terminal and the identified staff member on
            screen at all times, and that includes saying when nobody is
            identified. A shared till is only safe if whose PIN is active is
            visible, which means the locked state has to be visible too.
          */}
          {viewerName === null ? (
            <StatusPill label="Locked" icon={Lock} tone="warn" size="sm" />
          ) : (
            <>
              <span className="text-sm">
                <span className="font-medium">{viewerName}</span>
                <span className="text-ink-subtle ms-1.5">{viewerRole}</span>
              </span>
              <form action={lockAction}>
                <Button size="sm" tone="ghost" icon={Lock} type="submit">
                  Lock
                </Button>
              </form>
            </>
          )}

          {canOpenBackOffice && (
            <Link
              href="/admin"
              className="text-ink-muted hover:text-ink min-h-touch inline-flex items-center rounded-base px-2 text-sm underline underline-offset-4"
            >
              Back office
            </Link>
          )}

          {/* Ends the terminal binding; register close is managed separately. */}
          <form action={signOutAction}>
            <Button size="sm" tone="ghost" icon={LogOut} type="submit">
              Sign out terminal
            </Button>
          </form>
        </div>
      </header>

      <main className="flex-1">
        {!shiftOpen && pathname !== '/shift' ? (
          <ClosedRegister canManageStaff={canManageStaff} />
        ) : (
          children
        )}
      </main>
    </div>
  );
}

function ClosedRegister({ canManageStaff }: { canManageStaff: boolean }) {
  return (
    <section className="flex min-h-[70dvh] items-center justify-center p-8">
      <div className="border-border bg-surface-raised flex max-w-lg flex-col items-center gap-4 rounded-lg border p-8 text-center shadow-sm sm:p-12">
        <span className="bg-warn-soft text-warn rounded-full p-4">
          <Lock aria-hidden="true" className="size-8" />
        </span>
        <div>
          <h1 className="text-xl font-semibold">Register closed</h1>
          <p className="text-ink-muted mt-2 text-sm">
            Sales and till operations are unavailable until an authorized staff member opens a
            shift. Back-office features remain available from the Back office link above.
          </p>
        </div>
        <Link
          href="/shift"
          className="bg-primary text-primary-ink border-primary hover:bg-primary-hover min-h-touch inline-flex items-center justify-center rounded-base border px-5 py-2 font-medium shadow-sm transition-colors"
        >
          Open shift
        </Link>
        {canManageStaff && (
          <Link
            href="/admin/staff"
            className="min-h-touch inline-flex items-center text-sm underline underline-offset-4"
          >
            Set up staff PINs
          </Link>
        )}
      </div>
    </section>
  );
}
