/**
 * Roles and permissions — BUILD-PLAN.md §14.1.
 *
 * Permissions are checked server-side on every action. Hiding a button is
 * cosmetic (§14.1).
 *
 * **Every string here is a member of the frozen `PermissionSchema`**
 * (`packages/contracts/src/enums.ts`). `roles.permissions` is `text[]`, so the
 * database will accept `tables.write` as happily as `table.manage` — and a
 * grant nothing ever checks is worse than a missing one, because the roles
 * screen shows it and everyone believes it. `packages/db/test/roles.test.ts`
 * fails on any string outside the contract.
 *
 * AUDITOR exists for PSTSA s.32(2), which grants an officer full access to
 * electronic records. Giving an inspector a read-only account is a great deal
 * safer than handing over the owner login, which is what happens otherwise.
 */
export interface RoleSeed {
  readonly key: string;
  readonly name: string;
  /** §14.1's capability sentence, verbatim. Shown on the roles screen. */
  readonly description: string;
  readonly permissions: readonly string[];
}

export const ROLES: readonly RoleSeed[] = [
  {
    key: 'OWNER',
    name: 'Owner',
    description: 'Everything, including tax policy, settings, and user management.',
    // `@natech/auth` expands the wildcard against the frozen contract, so a
    // permission added later is granted to the owner without a migration.
    permissions: ['*'],
  },
  {
    key: 'MANAGER',
    name: 'Manager',
    description: 'Menu, tables, discounts, refunds, voids, shift close, and all reports.',
    // §14.1 lists what a manager may do and does not list settings, tax policy,
    // sensitive outlet settings or user management — those remain owner-only
    // clause calls out. `settings.read` is here because a manager who cannot
    // see the tax policy cannot answer a customer asking about the rate.
    permissions: [
      'order.create',
      'order.send',
      'order.void',
      'discount.apply',
      'discount.override',
      'payment.take',
      'invoice.finalize',
      'invoice.refund',
      'table.manage',
      'menu.write',
      'floor.write',
      'shift.close',
      'reports.read',
      'reports.export',
      'expenses.write',
      'settings.read',
    ],
  },
  {
    key: 'CASHIER',
    name: 'Cashier',
    description: 'Orders, take payment, finalize, void, and their own shift.',
    // §14.1 says "own shift", which is a scope and not a separate permission —
    // the frozen contract has one `shift.close`. M12 must check that the shift
    // being closed belongs to the cashier closing it.
    permissions: [
      'order.create',
      'order.send',
      'order.void',
      'payment.take',
      'invoice.finalize',
      'shift.close',
    ],
  },
  {
    key: 'WAITER',
    name: 'Waiter',
    description: 'Orders only. No payment, no finalize.',
    permissions: ['order.create', 'order.send'],
  },
  {
    key: 'AUDITOR',
    name: 'Auditor',
    description: 'Read-only reports, tax exports, and the auditor access pack.',
    permissions: ['reports.read', 'reports.export', 'settings.read'],
  },
];
