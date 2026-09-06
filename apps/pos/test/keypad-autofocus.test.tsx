import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { paisa } from '@natech/domain';
import { OpenShiftDialog } from '@/components/shift/OpenShiftDialog';
import { DiscountDialog } from '@/components/order/DiscountDialog';
import { CashMovementDialog } from '@/components/shift/CashMovementDialog';

/**
 * Till hardware is not assumed to be touch. `NumericKeypad` (`@natech/ui`)
 * already handled physical digit keys and Backspace, but nothing ever
 * focused it and there was no way to submit with `Enter` — every screen
 * built on it needed a click first. These three components exercise the
 * three distinct ways a keypad reaches the screen in this app (a `Dialog`
 * that keeps its children mounted across open/close, the same but with a
 * second keypad that only conditionally mounts, and a component that
 * mounts/unmounts outright) — proving the fix holds across all three,
 * rather than asserting on `NumericKeypad` alone.
 */
describe('keyboard-only amount entry — till hardware is not touch', () => {
  it('OpenShiftDialog: types and submits with no click, and refocuses on reopen', async () => {
    const user = userEvent.setup({ delay: null });
    const onConfirm = vi.fn();
    const { rerender } = render(
      <OpenShiftDialog open={false} pending={false} onClose={() => {}} onConfirm={onConfirm} />,
    );

    rerender(<OpenShiftDialog open pending={false} onClose={() => {}} onConfirm={onConfirm} />);
    await user.keyboard('500{Enter}');
    expect(onConfirm).toHaveBeenCalledWith(paisa(500n));

    // Close and reopen — `Dialog` keeps its children mounted, so the keypad
    // only refocuses itself if it actually remounted.
    onConfirm.mockClear();
    rerender(
      <OpenShiftDialog open={false} pending={false} onClose={() => {}} onConfirm={onConfirm} />,
    );
    rerender(<OpenShiftDialog open pending={false} onClose={() => {}} onConfirm={onConfirm} />);
    await user.keyboard('750{Enter}');
    expect(onConfirm).toHaveBeenCalledWith(paisa(750n));
  });

  it('DiscountDialog: auto-focuses the supervisor PIN keypad the moment a discount crosses the threshold', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <DiscountDialog
        open
        subtotal={paisa(10_000_00n)}
        offline={false}
        onClose={() => {}}
        onApply={() => {}}
      />,
    );

    // Typed straight into the amount keypad — it already has focus.
    // Rs. 600, above the Rs. 500 supervisor threshold.
    await user.keyboard('60000');

    const pinKeypad = screen.getByRole('group', { name: 'Supervisor PIN' });
    expect(pinKeypad).toHaveFocus();
  });

  it('CashMovementDialog: focuses its keypad the moment it mounts (no wrapping Dialog to key off)', async () => {
    const user = userEvent.setup({ delay: null });
    const onConfirm = vi.fn();
    render(
      <CashMovementDialog
        type="PAY_IN"
        pending={false}
        error={null}
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );

    await user.keyboard('1000');
    expect(screen.getByRole('group', { name: 'Amount' })).toHaveFocus();
  });
});
