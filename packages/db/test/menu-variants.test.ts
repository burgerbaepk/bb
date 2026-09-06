import { describe, expect, it } from 'vitest';
import { MENU_ITEMS, SOURCE_MENU_ITEMS, VARIANT_FAMILIES } from '../seeds/menu';

describe('the consolidated restaurant menu', () => {
  it('retains every original selling option at its exact price', () => {
    for (const source of SOURCE_MENU_ITEMS) {
      const family = VARIANT_FAMILIES.find((entry) =>
        entry.options.some(([sku]) => sku === source.sku),
      );
      if (!family) {
        expect(MENU_ITEMS.find((item) => item.sku === source.sku)).toEqual(source);
        continue;
      }
      const item = MENU_ITEMS.find((entry) => entry.sku === family.options[0][0]);
      const label = family.options.find(([sku]) => sku === source.sku)?.[1];
      const variant = item?.variants?.find((entry) => entry.name === label);
      expect(item).toBeDefined();
      expect(variant).toBeDefined();
      expect((item?.basePrice ?? 0n) + (variant?.priceDelta ?? 0n)).toBe(source.basePrice);
    }
  });

  it('offers one tile per family and one default size at the base price', () => {
    expect(SOURCE_MENU_ITEMS).toHaveLength(89);
    expect(MENU_ITEMS).toHaveLength(66);
    for (const family of VARIANT_FAMILIES) {
      const members = MENU_ITEMS.filter((item) => family.options.some(([sku]) => sku === item.sku));
      expect(members).toHaveLength(1);
      expect(members[0]?.name).toBe(family.name);
      expect(members[0]?.variants?.filter((variant) => variant.isDefault)).toEqual([
        { name: family.options[0][1], priceDelta: 0n, isDefault: true },
      ]);
    }
  });

  it('keeps larger side portions unspecified instead of inventing piece counts', () => {
    for (const name of ['Nuggets', 'Baked Wings', 'Fried Wings']) {
      expect(
        MENU_ITEMS.find((item) => item.name === name)?.variants?.map((variant) => variant.name),
      ).toEqual(['6 Pc', 'Large']);
    }
  });
});
