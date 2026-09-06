import { describe, expect, it } from 'vitest';
import { paisa } from '@natech/domain';
import type { PublicMenu, PublicMenuItem } from '@natech/contracts';
import { matchPopular } from './popular';

/**
 * §13.1, defect C4 — asserted against the rule, not the implementation.
 *
 * C4 in its original form is "Popular Items lists dishes that are not on this
 * menu". These cases are the ways that comes back through a sales table.
 */
function item(name: string, overrides: Partial<PublicMenuItem> = {}): PublicMenuItem {
  return {
    id: `id-${name}`,
    slug: name.toLowerCase(),
    categorySlug: 'burgers',
    name,
    nameUr: null,
    description: null,
    descriptionUr: null,
    imageUrl: null,
    priceExTax: paisa(50_000n),
    variants: [],
    isAvailable: true,
    ...overrides,
  };
}

const menu: PublicMenu = {
  categories: [{ id: 'c1', slug: 'burgers', name: 'Burgers', nameUr: null, sortOrder: 1 }],
  items: [
    item('Zinger Burger'),
    item('Tower Grilled Burger'),
    item('Off Menu', { isAvailable: false }),
  ],
};

describe('matchPopular', () => {
  it('keeps sales order', () => {
    const picked = matchPopular(menu, [
      { name: 'Tower Grilled Burger', soldCount: 40 },
      { name: 'Zinger Burger', soldCount: 12 },
    ]);
    expect(picked.map((entry) => entry.name)).toEqual(['Tower Grilled Burger', 'Zinger Burger']);
  });

  it('drops a dish that is no longer on the menu — defect C4', () => {
    // The snapshot is what the guest was charged for months ago. The menu is
    // what the kitchen makes today, and only the menu may reach the page.
    const picked = matchPopular(menu, [
      { name: 'Discontinued Wrap', soldCount: 99 },
      { name: 'Zinger Burger', soldCount: 4 },
    ]);
    expect(picked.map((entry) => entry.name)).toEqual(['Zinger Burger']);
  });

  it('drops a dish the kitchen has turned off', () => {
    // Recommending it is a promise the floor cannot keep.
    expect(matchPopular(menu, [{ name: 'Off Menu', soldCount: 99 }])).toEqual([]);
  });

  it('never lists the same dish twice', () => {
    const picked = matchPopular(menu, [
      { name: 'Zinger Burger', soldCount: 9 },
      { name: 'Zinger Burger', soldCount: 4 },
    ]);
    expect(picked).toHaveLength(1);
  });

  it('returns nothing when no sale matches, so the caller can render nothing', () => {
    expect(matchPopular(menu, [])).toEqual([]);
    expect(matchPopular(menu, [{ name: 'Ghost Dish', soldCount: 50 }])).toEqual([]);
  });
});
