import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { expandPermissions } from '@natech/auth';
import TerminalLayout from '@/app/(terminal)/layout';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
vi.mock('@/lib/auth/session', () => ({
  requireBinding: vi.fn(async () => ({ terminalId: 't1', terminalLabel: 'Till 1' })),
  requireOperator: vi.fn(async () => ({
    displayName: 'Owner',
    role: 'OWNER',
    permissions: expandPermissions(['*']),
  })),
  currentTillIdentity: vi.fn(async () => null),
}));
vi.mock('@/lib/auth/queries', () => ({
  idleLockSeconds: vi.fn(async () => 60),
  listTillStaff: vi.fn(async () => []),
}));
vi.mock('@/lib/auth/cookies', () => ({ readStaffCookie: vi.fn(async () => null) }));
vi.mock('@/lib/orders/queries', () => ({ activeOrderCount: vi.fn(async () => 0) }));
vi.mock('@/lib/shifts/queries', () => ({ readOpenShift: vi.fn(async () => null) }));
vi.mock('@/lib/webOrders/queries', () => ({ readPendingWebOrders: vi.fn(async () => []) }));

it('lets a signed-in owner reach the dashboard and PIN setup with no shift or till identity', async () => {
  render(await TerminalLayout({ children: <div>Sales workspace</div> }));
  expect(screen.getByRole('link', { name: 'Back office' })).toHaveAttribute('href', '/admin');
  expect(screen.getByRole('link', { name: 'Set up staff PINs' })).toHaveAttribute(
    'href',
    '/admin/staff',
  );
  expect(screen.getByText('Register closed')).toBeInTheDocument();
  expect(screen.queryByText('Sales workspace')).toBeNull();
});
