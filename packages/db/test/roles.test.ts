import { describe, expect, it } from 'vitest';
import { expandPermissions, unknownGrants, ALL_PERMISSIONS } from '@natech/auth';
import { ROLES } from '../seeds/roles';

/**
 * The seeded roles against the frozen contract — BUILD-PLAN.md §14.1, ADR 0008.
 *
 * `roles.permissions` is `text[]`, so the database accepts any string. A grant
 * outside the frozen `PermissionSchema` therefore resolves to nothing while
 * still appearing on the roles screen and in an export — a permission everyone
 * believes was given and nothing ever checks.
 *
 * This suite is the reason M07 rewrote the M02 seed: it granted `tables.write`,
 * `stations.write`, `order.write`, `shift.own`, `kds.read`, `kds.bump`, and
 * `tax.export`, none of which is a permission. The contracts were written in
 * M04-M06 and frozen at M06; the seed predates them and had drifted.
 */
describe('every seeded role grants only permissions the contract defines', () => {
  for (const role of ROLES) {
    it(role.key, () => {
      expect(unknownGrants(role.permissions)).toEqual([]);
    });
  }
});

describe('the §14.1 capability table', () => {
  const grantsOf = (key: string) =>
    expandPermissions(ROLES.find((role) => role.key === key)?.permissions ?? []);

  it('gives OWNER everything', () => {
    expect(grantsOf('OWNER')).toEqual([...ALL_PERMISSIONS]);
  });

  it('withholds owner-only powers from MANAGER', () => {
    const manager = grantsOf('MANAGER');
    expect(manager).not.toContain('settings.tax.write');
    expect(manager).not.toContain('staff.write');
    expect(manager).toContain('invoice.refund');
  });

  it('gives CASHIER payment and finalize but not a refund', () => {
    const cashier = grantsOf('CASHIER');
    expect(cashier).toContain('payment.take');
    expect(cashier).toContain('invoice.finalize');
    expect(cashier).not.toContain('invoice.refund');
    expect(cashier).not.toContain('discount.override');
  });

  it('gives WAITER no payment and no finalize', () => {
    const waiter = grantsOf('WAITER');
    expect(waiter).toEqual(['order.create', 'order.send']);
  });

  it('gives AUDITOR read-only reporting and settings access', () => {
    expect(grantsOf('AUDITOR')).toEqual(['reports.read', 'reports.export', 'settings.read']);
  });

  it('gives every role a description for the roles screen', () => {
    for (const role of ROLES) {
      expect(role.description.length).toBeGreaterThan(0);
    }
  });
});
