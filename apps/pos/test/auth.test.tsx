import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expandPermissions } from '@natech/auth';
import type { Permission, Role, StaffMember } from '@natech/contracts';
import { PinLock } from '@/components/auth/PinLock';
import { SignInForm } from '@/components/auth/SignInForm';
import { AdminShell } from '@/components/admin/AdminShell';
import { StaffManager } from '@/components/admin/StaffManager';
import { PosShell } from '@/components/shell/PosShell';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }));

/**
 * M07 — the §14.2 surfaces.
 *
 * These assert what a screen shows and what it refuses to show. What a screen
 * *permits* is not testable here and is not meant to be: §14.1 says client-side
 * hiding is cosmetic, so the enforcement lives in `lib/auth/session.ts` and in
 * every action, and the policy behind it is proved in `packages/auth` and
 * `packages/db`.
 */

const TILL_STAFF = [
  { id: 'a1', displayName: 'Sana Iqbal', initials: 'SI', role: 'CASHIER' as const },
  { id: 'b2', displayName: 'Bilal Ahmed', initials: 'BA', role: 'WAITER' as const },
];

describe('the till lock screen — §14.2', () => {
  it('asks for a name before it will take a PIN', async () => {
    const user = userEvent.setup({ delay: null });
    render(<PinLock staff={TILL_STAFF} terminalLabel="Till 1" reason="IDLE" />);

    // A PIN alone cannot identify anybody: PINs are salted, so two people who
    // both chose 4715 are indistinguishable without a name to check against.
    expect(screen.queryByRole('button', { name: /Unlock/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: /Sana Iqbal/ }));
    expect(screen.getByRole('button', { name: /Unlock/ })).toBeInTheDocument();
  });

  it('will not submit fewer than four digits (§14.2)', async () => {
    const user = userEvent.setup({ delay: null });
    render(<PinLock staff={TILL_STAFF} terminalLabel="Till 1" reason="IDLE" />);

    await user.click(screen.getByRole('button', { name: /Sana Iqbal/ }));
    const unlock = screen.getByRole('button', { name: /Unlock/ });
    expect(unlock).toBeDisabled();

    for (const digit of ['4', '7', '1']) {
      await user.click(screen.getByRole('button', { name: digit }));
    }
    expect(unlock).toBeDisabled();

    await user.click(screen.getByRole('button', { name: '5' }));
    expect(unlock).toBeEnabled();
  });

  it('takes a PIN typed on a physical keyboard, no clicks on the keypad — till hardware is not touch', async () => {
    const user = userEvent.setup({ delay: null });
    render(<PinLock staff={TILL_STAFF} terminalLabel="Till 1" reason="IDLE" />);

    await user.click(screen.getByRole('button', { name: /Sana Iqbal/ }));
    const unlock = screen.getByRole('button', { name: /Unlock/ });
    expect(unlock).toBeDisabled();

    // No click into the keypad first — it must already have focus (autoFocus)
    // for a real keyboard to reach it at all.
    await user.keyboard('471');
    expect(unlock).toBeDisabled();
    await user.keyboard('5');
    expect(unlock).toBeEnabled();
  });

  it('submits on Enter once the PIN is long enough, not before', async () => {
    const requestSubmit = vi.fn();
    HTMLFormElement.prototype.requestSubmit = requestSubmit;
    const user = userEvent.setup({ delay: null });
    render(<PinLock staff={TILL_STAFF} terminalLabel="Till 1" reason="IDLE" />);

    await user.click(screen.getByRole('button', { name: /Sana Iqbal/ }));
    await user.keyboard('471{Enter}');
    expect(requestSubmit).not.toHaveBeenCalled();

    await user.keyboard('5{Enter}');
    expect(requestSubmit).toHaveBeenCalledOnce();
  });

  it('never renders a PIN in the clear', async () => {
    const user = userEvent.setup({ delay: null });
    const { container } = render(
      <PinLock staff={TILL_STAFF} terminalLabel="Till 1" reason="IDLE" />,
    );

    await user.click(screen.getByRole('button', { name: /Sana Iqbal/ }));
    for (const digit of ['4', '7', '1', '5']) {
      await user.click(screen.getByRole('button', { name: digit }));
    }

    // The keypad shows a mask. The digits reach the server in a hidden field
    // and appear nowhere a shoulder can read them.
    expect(container.textContent).not.toContain('4715');
  });

  it('links staff managers to PIN setup before anybody has a PIN', () => {
    render(<PinLock staff={[]} terminalLabel="Till 1" reason="NEW" canManageStaff />);
    expect(screen.getByRole('link', { name: /Set up staff PINs/ })).toHaveAttribute(
      'href',
      '/admin/staff',
    );
  });

  it('says so when nobody can unlock the till yet', () => {
    render(<PinLock staff={[]} terminalLabel="Till 1" reason="NEW" />);
    expect(screen.getByText(/Nobody has a till PIN yet/)).toBeInTheDocument();
  });
});

describe('the POS chrome — §14.2', () => {
  const shell = (viewerName: string | null) =>
    render(
      <PosShell
        activeOrderCount={0}
        webOrderCount={0}
        shiftOpen={false}
        terminalId="11111111-1111-4111-8111-111111111111"
        terminalLabel="Till 1"
        viewerName={viewerName}
        viewerRole={viewerName === null ? null : 'CASHIER'}
        canOpenBackOffice
        canManageStaff
      >
        <div />
      </PosShell>,
    );

  it('names the bound terminal and the identified person at all times', () => {
    shell('Sana Iqbal');
    expect(screen.getByText('Till 1')).toBeInTheDocument();
    expect(screen.getByText('Sana Iqbal')).toBeInTheDocument();
  });

  it('says the till is locked when nobody is identified', () => {
    shell(null);
    // §14.2 — a shared till is only safe if whose PIN is active is visible,
    // which means the absence of one has to be visible too.
    expect(screen.getByText('Locked')).toBeInTheDocument();
    expect(screen.getByText('Till 1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back office/ })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('link', { name: /Set up staff PINs/ })).toHaveAttribute(
      'href',
      '/admin/staff',
    );
  });

  it('keeps the offline banner reachable while locked (§8)', async () => {
    shell(null);
    expect(screen.queryByRole('status')).toBeNull();

    // §8 — real `navigator.onLine`/`offline` state, not the Phase-1 switch
    // this screen used to carry (`docs/runfiles/M16-offline.md`).
    act(() => {
      Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });

    const banner = await screen.findByRole('status');
    expect(within(banner).getByText(/0 orders queued/)).toBeInTheDocument();

    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  });
});

describe('the sign-in form — §14.2 terminal binding', () => {
  const terminals = [
    { id: '11111111-1111-4111-8111-111111111111', label: 'Till 1' },
    { id: '22222222-2222-4222-8222-222222222222', label: 'Till 2' },
  ];

  it('binds to a chosen till, with the remembered one selected', () => {
    render(
      <SignInForm
        terminals={terminals}
        defaultTerminalId={terminals[1]?.id ?? null}
        notice={null}
      />,
    );
    expect(screen.getByLabelText(/Till/)).toHaveValue(terminals[1]?.id);
  });

  it('refuses to offer a sign-in when no till is registered', () => {
    render(<SignInForm terminals={[]} defaultTerminalId={null} notice={null} />);
    expect(screen.getByText(/No till is registered/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Password/)).toBeNull();
  });
});

describe('the back office nav — §14.1', () => {
  const shellFor = (permissions: readonly Permission[]) =>
    render(
      <AdminShell
        viewerName="Aisha"
        viewerRole="AUDITOR"
        permissions={permissions}
        assistant={false}
      >
        <div />
      </AdminShell>,
    );

  it('offers an auditor only what an auditor holds', () => {
    shellFor(expandPermissions(['reports.read', 'reports.export', 'settings.read']));

    expect(screen.getByRole('link', { name: /Reports/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Invoices/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Settings/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Branding/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Staff and roles/ })).toBeNull();
  });

  it('offers an owner the settings screen', () => {
    shellFor(expandPermissions(['*']));
    expect(screen.getByRole('link', { name: /Settings/ })).toBeInTheDocument();
  });

  it('drops a section with nothing visible in it rather than leaving it empty', () => {
    shellFor(expandPermissions(['reports.read']));
    expect(screen.queryByText('Service')).toBeNull();
    expect(screen.queryByText('Control')).toBeNull();
    expect(screen.getByText('Oversight')).toBeInTheDocument();
  });
});

describe('the staff screen — §14.1, §14.2', () => {
  const staff: StaffMember[] = [
    {
      id: 'a1',
      displayName: 'Sana Iqbal',
      initials: 'SI',
      email: 'sana@test.invalid',
      roles: ['CASHIER'],
      hasPin: true,
      isActive: true,
      lastActiveAt: null,
    },
    {
      id: 'b2',
      displayName: 'Imran Shah',
      initials: 'IS',
      email: 'imran@test.invalid',
      roles: ['MANAGER'],
      hasPin: false,
      isActive: true,
      lastActiveAt: null,
    },
  ];

  const roles: Role[] = [
    {
      key: 'CASHIER',
      name: 'Cashier',
      description: 'Orders, take payment, finalize.',
      permissions: expandPermissions(['order.create', 'order.void', 'payment.take']),
      memberCount: 1,
    },
    {
      key: 'AUDITOR',
      name: 'Auditor',
      description: 'Read-only reports and compliance.',
      permissions: [],
      memberCount: 0,
    },
  ];

  it('derives the header counts from the rows it renders (R16)', () => {
    render(<StaffManager staff={staff} roles={roles} currentUserId="a1" />);
    const summary = screen.getByText(/with a till PIN/);
    expect(summary.textContent).toContain('2');
    expect(summary.textContent).toContain('1');
  });

  it('offers to set a PIN but never to read one', async () => {
    const user = userEvent.setup({ delay: null });
    render(<StaffManager staff={staff} roles={roles} currentUserId="a1" />);

    await user.click(screen.getByText('Sana Iqbal'));
    expect(screen.getByRole('button', { name: /Replace the PIN/ })).toBeInTheDocument();
    // `StaffMember` carries `hasPin`, not a PIN, so there is nothing to leak.
    expect(screen.queryByText(/current PIN/i)).toBeNull();
  });

  it('will not let an owner deactivate their own account', async () => {
    const user = userEvent.setup({ delay: null });
    render(<StaffManager staff={staff} roles={roles} currentUserId="a1" />);

    await user.click(screen.getByText('Sana Iqbal'));
    expect(screen.getByRole('button', { name: /Deactivate/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Delete account/ })).toBeDisabled();
  });

  it('offers password replacement and confirmed deletion for another account', async () => {
    const user = userEvent.setup({ delay: null });
    render(<StaffManager staff={staff} roles={roles} currentUserId="a1" />);

    await user.click(screen.getByText('Imran Shah'));
    expect(screen.getByLabelText(/New password/)).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText(/Confirm new password/)).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: /Update password/ })).toBeInTheDocument();
    expect(screen.getByLabelText(/Confirm display name/)).toBeEnabled();
    expect(screen.getByRole('button', { name: /Delete account/ })).toBeEnabled();
  });

  it('reads a role with no grants as token-scoped rather than as broken (§14.1)', async () => {
    const user = userEvent.setup({ delay: null });
    render(<StaffManager staff={staff} roles={roles} currentUserId="a1" />);

    await user.click(screen.getByRole('button', { name: /Roles/ }));
    expect(screen.getByText('Token-scoped only')).toBeInTheDocument();
  });
});
