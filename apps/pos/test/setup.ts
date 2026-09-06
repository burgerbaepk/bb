import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

/**
 * jsdom does not implement the native `<dialog>` modal methods, and both
 * `Dialog` and `Sheet` in `@natech/ui` are built on the element for its focus
 * trap and Escape handling. Without these the components throw on open and
 * every test that renders one fails for a reason unrelated to what it asserts.
 */
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
}

/**
 * Server actions are opaque function references as far as a client component is
 * concerned, and importing the real module pulls in Auth.js, `next/server`, and
 * the Neon driver. A test asserting that the offline banner shows a queue depth
 * has no business booting the authentication stack, so the §14.2 actions are
 * replaced by the shape the components call.
 *
 * The actions themselves are covered where they can be covered honestly:
 * `packages/auth` proves the policy, and `test/auth.test.tsx` proves the
 * surfaces that render around it.
 */
vi.mock('@/lib/auth/actions/session', () => ({
  NO_ERROR: { error: null, nonce: 0 },
  signInAction: vi.fn(),
  signOutAction: vi.fn(),
  unlockAction: vi.fn(async () => ({ error: null, nonce: 1 })),
  lockAction: vi.fn(),
  touchIdentityAction: vi.fn(),
}));

vi.mock('@/lib/auth/actions/staff', () => ({
  STAFF_IDLE: { error: null, message: null },
  createStaffAction: vi.fn(),
  updateStaffAction: vi.fn(),
  deleteStaffAction: vi.fn(),
  setPinAction: vi.fn(),
  setPasswordAction: vi.fn(),
  setActiveAction: vi.fn(),
}));

/**
 * §13.4's alarm lives in the terminal layout, so every suite that renders a
 * till surface now pulls `WebOrderAlert` and its server action in behind it.
 * Same reasoning as the §14.2 actions above: the shape the component calls,
 * with nothing pending, so no suite starts ringing at its own assertions.
 * `lib/webOrders/alerting.test.ts` covers the rule that decides when it does.
 */
vi.mock('@/lib/webOrders/actions', () => ({
  acceptWebOrderAction: vi.fn(async () => ({ ok: true, error: null })),
  rejectWebOrderAction: vi.fn(async () => ({ ok: true, error: null })),
  loadPendingWebOrdersAction: vi.fn(async () => ({ ok: true, orders: [], error: null })),
}));

/**
 * M21 gave the settings registry a real save path, so the component now
 * imports a server action like every other write surface. Same reasoning as
 * the §14.2 actions above; `lib/settings/serialise.test.ts` and the action's
 * own guards are where the write rules are proved, not here.
 */
vi.mock('@/lib/settings/actions', () => ({
  saveSettingAction: vi.fn(async () => ({ ok: true, error: null })),
}));
