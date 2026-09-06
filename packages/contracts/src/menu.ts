import { z } from 'zod';
import { PaisaSchema, PaisaWireSchema } from './money';
import { TaxClassKeySchema } from './enums';

/**
 * Menu — BUILD-PLAN.md §5.3, §5.4, §7.6.
 *
 * Two things here are load-bearing rather than descriptive.
 *
 * `basePrice` is **tax-exclusive** (§5.3). The reference receipt settles it: the
 * menu shows Rs. 530 and the invoice line reads 4 × 530.00 = 2,120.00 against
 * `Total (Ex Tax) 12,220.00`. A tax-inclusive price here would make the check
 * estimate wrong in both of its rate columns.
 *
 * An item carries **variants**, not siblings. `Special Mutton Mix Olive` is one
 * item with `Full` and `Half`, not two grid tiles (§5.3). That collapse removes
 * about two thirds of the tiles and is what stops the category strip
 * overflowing and hiding categories 4 to 13.
 */

export const BilingualSchema = z.object({
  name: z.string().min(1),
  /** §15.1 — menu data carries Urdu; the POS chrome does not. */
  nameUr: z.string().nullable(),
});
export type Bilingual = z.infer<typeof BilingualSchema>;

export const CategorySchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  nameUr: z.string().nullable(),
  slug: z.string().min(1),
  sortOrder: z.int(),
  colour: z.string().nullable(),
  isActive: z.boolean(),
});
export type Category = z.infer<typeof CategorySchema>;

export const ItemVariantSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  nameUr: z.string().nullable(),
  /** Added to `basePrice`. The default variant is normally zero. */
  priceDelta: PaisaSchema,
  isDefault: z.boolean(),
});
export type ItemVariant = z.infer<typeof ItemVariantSchema>;

export const ModifierSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  nameUr: z.string().nullable(),
  priceDelta: PaisaSchema,
});
export type Modifier = z.infer<typeof ModifierSchema>;

export const ModifierGroupSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  nameUr: z.string().nullable(),
  minSelect: z.int().nonnegative(),
  maxSelect: z.int().positive(),
  isRequired: z.boolean(),
  modifiers: z.array(ModifierSchema),
});
export type ModifierGroup = z.infer<typeof ModifierGroupSchema>;

/** §7.6 — snapshotted onto the order line at add time (§5.6). */
export const MenuItemSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  sku: z.string().nullable(),
  name: z.string().min(1),
  nameUr: z.string().nullable(),
  slug: z.string().min(1),
  description: z.string().nullable(),
  descriptionUr: z.string().nullable(),
  imageKey: z.string().nullable(),
  /** Tax-exclusive. §5.3. */
  basePrice: PaisaSchema,
  taxClass: TaxClassKeySchema,
  variants: z.array(ItemVariantSchema),
  modifierGroups: z.array(ModifierGroupSchema),
  sortOrder: z.int(),
  isActive: z.boolean(),
});
export type MenuItem = z.infer<typeof MenuItemSchema>;

/** What every menu surface is handed: the whole menu, already ordered. */
export const MenuSchema = z.object({
  categories: z.array(CategorySchema),
  items: z.array(MenuItemSchema),
});
export type Menu = z.infer<typeof MenuSchema>;

/** The admin editor writes this shape (M08). Prices arrive as wire strings. */
export const MenuItemDraftSchema = z.object({
  categoryId: z.uuid(),
  sku: z.string().nullable(),
  name: z.string().min(1),
  nameUr: z.string().nullable(),
  description: z.string().nullable(),
  descriptionUr: z.string().nullable(),
  basePrice: PaisaWireSchema,
  taxClass: TaxClassKeySchema,
  isActive: z.boolean(),
});
export type MenuItemDraft = z.infer<typeof MenuItemDraftSchema>;
