import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

/**
 * `CartProvider`/`CheckoutFlow` import `'use server'` action modules that
 * transitively pull in `lib/auth/session.ts`, which carries `import
 * 'server-only'` — unresolvable outside Next's own bundler, the identical
 * trap CLAUDE.md's own notes describe for `apps/pos/test/setup.ts`. Mocked
 * globally the same way: the actions themselves are covered where they can
 * be covered honestly (code review, this runfile's own disclosed gaps), and
 * these tests assert UI behaviour given canned responses, not the real
 * network round trip.
 */
vi.mock('@/lib/cart/actions', () => ({ saveCartAction: vi.fn() }));
vi.mock('@/lib/orders/actions', () => ({
  placeOrderAction: vi.fn(async () => ({ ok: true, publicId: 'test-order' })),
}));

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
