import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expandPermissions } from '@natech/auth';
import { AdminShell } from '@/components/admin/AdminShell';

const route = vi.hoisted(() => ({ pathname: '/admin' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

beforeEach(() => {
  route.pathname = '/admin';
});

function renderShell(grants: Parameters<typeof expandPermissions>[0] = ['*']) {
  render(
    <AdminShell
      viewerName="Owner"
      viewerRole="OWNER"
      permissions={expandPermissions(grants)}
      assistant={false}
    >
      <div>Page content</div>
    </AdminShell>,
  );
  return within(screen.getByRole('navigation', { name: 'Back office' }));
}

describe('back-office sidebar navigation', () => {
  it('provides an explicit Dashboard entry and highlights it on the dashboard', () => {
    const nav = renderShell();
    expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/admin');
    expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('link', { name: 'Menu' })).not.toHaveAttribute('aria-current');
  });

  it('highlights only Menu on the menu page and keeps Dashboard reachable', () => {
    route.pathname = '/admin/menu';
    const nav = renderShell();
    expect(nav.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
    expect(nav.getByRole('link', { name: 'Menu' })).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the section highlighted on a nested route', () => {
    route.pathname = '/admin/staff/member';
    const nav = renderShell();
    expect(nav.getByRole('link', { name: 'Staff and roles' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(nav.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('matches Dashboard visibility to the page reports.read permission', () => {
    const nav = renderShell(['menu.write']);
    expect(nav.queryByRole('link', { name: 'Dashboard' })).toBeNull();
    expect(nav.getByRole('link', { name: 'Menu' })).toBeInTheDocument();
  });
});
