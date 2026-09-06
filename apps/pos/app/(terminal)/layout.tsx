import { ToastProvider } from '@natech/ui';
import { can } from '@natech/contracts';
import { PosShell } from '@/components/shell/PosShell';
import { WebOrderAlert } from '@/components/weborders/WebOrderAlert';
import { PinLock } from '@/components/auth/PinLock';
import { IdleWatcher } from '@/components/auth/IdleWatcher';
import { currentTillIdentity, requireBinding, requireOperator } from '@/lib/auth/session';
import { idleLockSeconds, listTillStaff } from '@/lib/auth/queries';
import { readStaffCookie } from '@/lib/auth/cookies';
import { activeOrderCount } from '@/lib/orders/queries';
import { readOpenShift } from '@/lib/shifts/queries';
import { readPendingWebOrders } from '@/lib/webOrders/queries';

/**
 * The till surfaces — BUILD-PLAN.md §18 M04, §14.2 (M07).
 *
 * M07 replaced the mock viewer with the real one and put the §14.2 split in
 * front of the shell:
 *
 *   The **binding** is checked first. No bound terminal, no till — straight to
 *   the sign-in screen, because every one of these surfaces writes something
 *   that has to name a terminal.
 *
 *   The **identification** is checked second, and failing it does not throw the
 *   cashier out. The chrome stays — the terminal label, the offline banner,
 *   the queue depth — and the working area becomes the lock screen. A till that
 *   hides whether it is online while asking for a PIN is a till nobody trusts.
 *
 * Both counts are real. The web-order badge read `MOCK_WEB_ORDERS` until
 * ADR 0024 — a Phase-1 fixture filtered on a live till, so the number never
 * moved for an actual QR order and staff had no signal one had arrived. It now
 * shares `readPendingWebOrders()` with the audible alarm below it, so the
 * badge, the alarm, and the inbox cannot disagree about what is waiting (R16).
 */
export default async function TerminalLayout({ children }: { children: React.ReactNode }) {
  const binding = await requireBinding();
  // The binding is already verified. Reuse it instead of decoding the Auth.js
  // session twice more, and resolve operator/till identities concurrently.
  const [operator, identity] = await Promise.all([
    requireOperator(binding),
    currentTillIdentity(binding),
  ]);

  const [staff, lockSeconds, staffCookie, openOrders, openShift, pendingWebOrders] =
    await Promise.all([
      identity === null ? listTillStaff() : Promise.resolve([]),
      idleLockSeconds(),
      readStaffCookie(),
      activeOrderCount(),
      readOpenShift(),
      readPendingWebOrders(),
    ]);

  return (
    <ToastProvider>
      <PosShell
        activeOrderCount={openOrders}
        webOrderCount={pendingWebOrders.length}
        shiftOpen={openShift !== null}
        terminalId={binding.terminalId}
        terminalLabel={binding.terminalLabel}
        viewerName={identity?.viewer.displayName ?? null}
        viewerRole={identity?.viewer.role ?? null}
        canOpenBackOffice
        canManageStaff={can(operator, 'staff.write')}
      >
        {identity === null ? (
          <PinLock
            staff={staff}
            canManageStaff={can(operator, 'staff.write')}
            terminalLabel={binding.terminalLabel}
            // A cookie that verified but no longer identifies anybody is the
            // idle timeout having fired; no cookie at all is a fresh binding.
            reason={staffCookie === null ? 'NEW' : 'IDLE'}
          />
        ) : (
          <>
            <IdleWatcher idleLockSeconds={lockSeconds} />
            {children}
            {/* §13.4 — mounted beside every till surface, not on the inbox:
                the operator who needs to hear a QR order arrive is by
                definition looking at something else. Only once the till is
                identified — an alarm on the PIN lock has nobody to ring for,
                and its poll would be refused anyway. */}
            <WebOrderAlert initial={pendingWebOrders} />
          </>
        )}
      </PosShell>
    </ToastProvider>
  );
}
