import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { paisa } from '@natech/domain';
import { DiscountDialog, percentOf } from '@/components/order/DiscountDialog';

/**
 * ADR 0028 — a percentage discount is keyed as whole percent and stored as
 * paisa, like any other discount. The percent survives only in the reason, so
 * the exceptions report still says what was actually offered.
 */
describe('a percentage discount', () => {
  it('rounds half up to the paisa', () => {
    expect(percentOf(paisa(148_000n), 10n)).toBe(paisa(14_800n));
    // Rs. 0.05 at 10% is half a paisa, which rounds up rather than vanishing.
    expect(percentOf(paisa(5n), 10n)).toBe(paisa(1n));
    expect(percentOf(paisa(148_000n), 100n)).toBe(paisa(148_000n));
  });

  it('applies as an amount and records the percent in the reason', async () => {
    const user = userEvent.setup({ delay: null });
    const onApply = vi.fn();
    render(
      <DiscountDialog
        open
        subtotal={paisa(148_000n)}
        offline={false}
        onClose={() => {}}
        onApply={onApply}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Percent (%)' }));
    await user.keyboard('10');
    await user.selectOptions(screen.getByLabelText(/Reason/), 'Promotion');
    await user.click(screen.getByRole('button', { name: 'Apply discount' }));

    expect(onApply).toHaveBeenCalledWith(paisa(14_800n), 'Promotion (10%)');
  });
});
