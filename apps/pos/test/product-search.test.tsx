import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { itemBySlug } from '@natech/contracts/mocks';
import type { MenuItem } from '@natech/contracts';
import { ProductSearch } from '@/components/order/ProductSearch';

/**
 * Fast keyboard billing — the restaurant's product-number quick-entry
 * workflow and its `Enter` priority list (exact number, then highlighted
 * result, then a sole name match).
 */
const base = itemBySlug('mutton-tikka-4-pcs');
function item(sku: string, name: string): MenuItem {
  return { ...base, id: `item-${sku}`, sku, name };
}

const ITEMS: readonly MenuItem[] = [
  item('2', 'Mutton Nalli'),
  item('28', 'Mix Tawa Desi Ghee'),
  item('280', 'Not The One'),
  item('66', 'Iced Tea Small'),
  item('67', 'Iced Tea Large'),
];

describe('ProductSearch — fast keyboard entry', () => {
  it('adds the exact product-number match, never a prefix match', async () => {
    const user = userEvent.setup({ delay: null });
    const onPick = vi.fn();
    render(<ProductSearch items={ITEMS} onPick={onPick} />);

    await user.type(screen.getByRole('textbox'), '28{Enter}');

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ sku: '28' }));
  });

  it('defaults Enter to the top name match with no arrow key pressed', async () => {
    const user = userEvent.setup({ delay: null });
    const onPick = vi.fn();
    render(<ProductSearch items={ITEMS} onPick={onPick} />);

    // "Iced Tea" matches both 66 (Small) and 67 (Large) — Small lists first.
    await user.type(screen.getByRole('textbox'), 'Iced Tea{Enter}');

    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ sku: '66' }));
  });

  it('adds the arrow-highlighted result, not the top one, once arrowed down', async () => {
    const user = userEvent.setup({ delay: null });
    const onPick = vi.fn();
    render(<ProductSearch items={ITEMS} onPick={onPick} />);

    await user.type(screen.getByRole('textbox'), 'Iced Tea');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ sku: '67' }));
  });

  it('clicking a result adds it directly', async () => {
    const user = userEvent.setup({ delay: null });
    const onPick = vi.fn();
    render(<ProductSearch items={ITEMS} onPick={onPick} />);

    await user.type(screen.getByRole('textbox'), 'Nalli');
    await user.click(screen.getByRole('button', { name: /Mutton Nalli/ }));

    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ sku: '2' }));
  });

  it('clears the search box once an item is picked', async () => {
    const user = userEvent.setup({ delay: null });
    render(<ProductSearch items={ITEMS} onPick={vi.fn()} />);

    const input = screen.getByRole('textbox');
    await user.type(input, '28{Enter}');

    expect(input).toHaveValue('');
  });
});
