import type { OutletConfig, Terminal } from '../src/outlet';
import type { Role, StaffMember, Viewer } from '../src/staff';
import type { Permission } from '../src/enums';
import { ago, uuidFrom } from './ids';

/**
 * Outlet identity for review — BUILD-PLAN.md §5.1, §14.3, R12.
 *
 * **None of this is a client's identity.** R12 says restaurant identity is
 * database state and never source, and the brand-grep gate enforces it. The
 * values below are invented so that the tax invoice header and the
 * storefront landing page can be reviewed with something in the shape of a
 * real registration number.
 *
 * The registration-number and phone lines carry `brand-grep-allow` because they
 * necessarily match the shapes the gate hunts for. That marker is the gate's own
 * sanctioned escape hatch, and this file is deleted when M08 resolves identity
 * from `outlet_config`.
 */
export const MOCK_OUTLET: OutletConfig = {
  legalName: 'Reference Kitchens (Private) Limited',
  tradingName: 'Reference Kitchen',
  address: '14 Ring Road',
  city: 'Lahore',
  phone: '+92 42 1234567', // brand-grep-allow — invented, for header review only
  email: 'hello@reference.example',
  ntn: '1234567-8', // brand-grep-allow — invented NTN shape, §7.1 header review
  strn: '3277812345678', // brand-grep-allow — invented STRN shape
  timezone: 'Asia/Karachi',
  businessDayCutoff: '05:00',
  latitude: 31.5204,
  longitude: 74.3587,
  storeOpen: '12:00',
  storeClose: '01:00',
  weeklyOffDays: [],
};

export const MOCK_TERMINALS: readonly Terminal[] = [
  {
    id: uuidFrom('terminal:till-1'),
    label: 'Till 1',
    posType: 'PRIMARY',
    isActive: true,
  },
  {
    id: uuidFrom('terminal:till-2'),
    label: 'Till 2',
    posType: 'SECONDARY',
    isActive: true,
  },
];

/** §14.1 — the five roles and the permissions each carries. */
const OWNER_PERMISSIONS: readonly Permission[] = [
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
  'staff.write',
  'shift.close',
  'reports.read',
  'reports.export',
  'audit.read',
  'settings.read',
  'settings.write',
  'settings.tax.write',
];

const MANAGER_PERMISSIONS: readonly Permission[] = [
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
  'settings.read',
];

const CASHIER_PERMISSIONS: readonly Permission[] = [
  'order.create',
  'order.send',
  'order.void',
  'discount.apply',
  'payment.take',
  'invoice.finalize',
  'table.manage',
];

/** §14.1 — a waiter takes orders. No payment, no finalize. */
const WAITER_PERMISSIONS: readonly Permission[] = ['order.create', 'order.send', 'table.manage'];

const AUDITOR_PERMISSIONS: readonly Permission[] = [
  'reports.read',
  'reports.export',
  'audit.read',
  'settings.read',
];

export const MOCK_ROLES: readonly Role[] = [
  {
    key: 'OWNER',
    name: 'Owner',
    description: 'Everything, including tax policy, outlet settings, and user management.',
    permissions: [...OWNER_PERMISSIONS],
    memberCount: 1,
  },
  {
    key: 'MANAGER',
    name: 'Manager',
    description: 'Menu, tables, discounts, refunds, voids, shift close, reports.',
    permissions: [...MANAGER_PERMISSIONS],
    memberCount: 2,
  },
  {
    key: 'CASHIER',
    name: 'Cashier',
    description: 'Orders, take payment, finalize, void, own shift.',
    permissions: [...CASHIER_PERMISSIONS],
    memberCount: 3,
  },
  {
    key: 'WAITER',
    name: 'Waiter',
    description: 'Orders only. No payment and no finalize.',
    permissions: [...WAITER_PERMISSIONS],
    memberCount: 4,
  },
  {
    key: 'AUDITOR',
    name: 'Auditor',
    description: 'Read-only reports, tax exports, compliance dashboard, s.32(2) access pack.',
    permissions: [...AUDITOR_PERMISSIONS],
    memberCount: 1,
  },
];

export const MOCK_STAFF: readonly StaffMember[] = [
  {
    id: uuidFrom('staff:owner'),
    displayName: 'Amina Karim',
    initials: 'AK',
    email: 'amina@reference.example',
    roles: ['OWNER'],
    hasPin: true,
    isActive: true,
    lastActiveAt: ago(240),
  },
  {
    id: uuidFrom('staff:manager'),
    displayName: 'Faisal Rehman',
    initials: 'FR',
    email: 'faisal@reference.example',
    roles: ['MANAGER'],
    hasPin: true,
    isActive: true,
    lastActiveAt: ago(900),
  },
  {
    id: uuidFrom('staff:cashier-1'),
    displayName: 'Sana Iqbal',
    initials: 'SI',
    email: 'sana@reference.example',
    roles: ['CASHIER'],
    hasPin: true,
    isActive: true,
    lastActiveAt: ago(60),
  },
  {
    id: uuidFrom('staff:waiter-1'),
    displayName: 'Bilal Ahmed',
    initials: 'BA',
    email: 'bilal@reference.example',
    roles: ['WAITER'],
    hasPin: true,
    isActive: true,
    lastActiveAt: ago(30),
  },
  {
    id: uuidFrom('staff:auditor'),
    displayName: 'Nadia Shah',
    initials: 'NS',
    email: 'audit@reference.example',
    roles: ['AUDITOR'],
    hasPin: false,
    isActive: true,
    lastActiveAt: null,
  },
];

/** The identity the POS renders against by default in Phase 1. */
export const MOCK_VIEWER_CASHIER: Viewer = {
  id: uuidFrom('staff:cashier-1'),
  displayName: 'Sana Iqbal',
  initials: 'SI',
  role: 'CASHIER',
  permissions: [...CASHIER_PERMISSIONS],
};

/** §9.2 — used to review the chip that omits its money row entirely. */
export const MOCK_VIEWER_WAITER: Viewer = {
  id: uuidFrom('staff:waiter-1'),
  displayName: 'Bilal Ahmed',
  initials: 'BA',
  role: 'WAITER',
  permissions: [...WAITER_PERMISSIONS],
};

export const MOCK_VIEWER_OWNER: Viewer = {
  id: uuidFrom('staff:owner'),
  displayName: 'Amina Karim',
  initials: 'AK',
  role: 'OWNER',
  permissions: [...OWNER_PERMISSIONS],
};
