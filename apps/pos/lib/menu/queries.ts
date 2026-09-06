import 'server-only';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  categories,
  dbRead,
  itemModifierGroups,
  itemVariants,
  menuItems,
  modifierGroups,
  modifiers,
  invoices,
  orderLines,
  taxClasses,
} from '@natech/db';
import { paisa } from '@natech/domain';
import {
  TaxClassKeySchema,
  type Category,
  type ItemVariant,
  type MenuItem,
  type Modifier,
  type ModifierGroup,
  type TaxClassKey,
} from '@natech/contracts';
import { slugify } from '../slug';

/**
 * Reads behind the menu screens — BUILD-PLAN.md §5.3, §5.4; M08 runfile.
 *
 * `dbRead` throughout (R2): every function here answers a React Server
 * Component render of `MenuManager` or `ModifierBuilder`. A write belongs in
 * `actions.ts`, on `dbWrite`, inside a transaction.
 */

/**
 * §5.3 — `menu_items.tax_class_id` is nullable. A restaurant food line with no
 * class assigned yet is standard-rated food, not untaxed, so that is the
 * default the contract's non-nullable `taxClass` field takes rather than
 * leaving the item unclassified on the till. Documented rather than silent,
 * because it is a business decision standing in for one nobody has made yet.
 */
const DEFAULT_TAX_CLASS_KEY: TaxClassKey = 'STANDARD_FOOD';

function asTaxClassKey(value: string | null): TaxClassKey {
  if (value === null) return DEFAULT_TAX_CLASS_KEY;
  const parsed = TaxClassKeySchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_TAX_CLASS_KEY;
}

/** The category list. `slug` has no backing column — see `lib/slug.ts`. */
export async function listCategories(): Promise<Category[]> {
  const rows = await dbRead()
    .select({
      id: categories.id,
      name: categories.name,
      nameUr: categories.nameUr,
      sortOrder: categories.sortOrder,
      colour: categories.colour,
      isActive: categories.isActive,
    })
    .from(categories)
    .where(isNull(categories.deletedAt))
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  return rows.map((row) => ({ ...row, slug: slugify(row.name) }));
}

/**
 * The menu editor's items, each with its variants and assigned modifier
 * groups nested — the shape `MenuItemSchema` wants and the mock this replaces
 * already carried. Four reads rather than a join-per-item: an item, its
 * category count, and a select-in on the two child tables scale with the size
 * of the menu, not with the number of round trips.
 */
export async function listMenuItems(options?: {
  readonly popularFirst?: boolean;
}): Promise<MenuItem[]> {
  const itemRows = await dbRead()
    .select({
      id: menuItems.id,
      categoryId: menuItems.categoryId,
      sku: menuItems.sku,
      name: menuItems.name,
      nameUr: menuItems.nameUr,
      description: menuItems.description,
      descriptionUr: menuItems.descriptionUr,
      imageKey: menuItems.imageKey,
      basePrice: menuItems.basePrice,
      taxClassKey: taxClasses.key,
      sortOrder: menuItems.sortOrder,
      isActive: menuItems.isActive,
    })
    .from(menuItems)
    .leftJoin(
      taxClasses,
      and(eq(taxClasses.id, menuItems.taxClassId), isNull(taxClasses.deletedAt)),
    )
    .where(isNull(menuItems.deletedAt))
    .orderBy(asc(menuItems.categoryId), asc(menuItems.sortOrder), asc(menuItems.name));

  if (itemRows.length === 0) return [];
  const itemIds = itemRows.map((row) => row.id);

  const variantRows = await dbRead()
    .select({
      id: itemVariants.id,
      menuItemId: itemVariants.menuItemId,
      name: itemVariants.name,
      nameUr: itemVariants.nameUr,
      priceDelta: itemVariants.priceDelta,
      isDefault: itemVariants.isDefault,
    })
    .from(itemVariants)
    .where(and(inArray(itemVariants.menuItemId, itemIds), isNull(itemVariants.deletedAt)))
    .orderBy(asc(itemVariants.priceDelta), asc(itemVariants.name));

  const variantsByItem = new Map<string, ItemVariant[]>();
  for (const row of variantRows) {
    const list = variantsByItem.get(row.menuItemId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      nameUr: row.nameUr,
      priceDelta: paisa(row.priceDelta),
      isDefault: row.isDefault,
    });
    variantsByItem.set(row.menuItemId, list);
  }

  const assignmentRows = await dbRead()
    .select({
      menuItemId: itemModifierGroups.menuItemId,
      groupId: itemModifierGroups.groupId,
      groupName: modifierGroups.name,
      groupNameUr: modifierGroups.nameUr,
      minSelect: modifierGroups.minSelect,
      maxSelect: modifierGroups.maxSelect,
      isRequired: modifierGroups.isRequired,
    })
    .from(itemModifierGroups)
    .innerJoin(
      modifierGroups,
      and(eq(modifierGroups.id, itemModifierGroups.groupId), isNull(modifierGroups.deletedAt)),
    )
    .where(
      and(inArray(itemModifierGroups.menuItemId, itemIds), isNull(itemModifierGroups.deletedAt)),
    )
    // The assigned order **is** `sort_order` (M08's "modifier groups on an
    // item" reorder target) — nothing downstream re-sorts, so the array
    // position it arrives in at a client is the order to render.
    .orderBy(asc(itemModifierGroups.sortOrder));

  const groupIds = [...new Set(assignmentRows.map((row) => row.groupId))];
  const modifierRows =
    groupIds.length === 0
      ? []
      : await dbRead()
          .select({
            id: modifiers.id,
            groupId: modifiers.groupId,
            name: modifiers.name,
            nameUr: modifiers.nameUr,
            priceDelta: modifiers.priceDelta,
          })
          .from(modifiers)
          .where(and(inArray(modifiers.groupId, groupIds), isNull(modifiers.deletedAt)))
          .orderBy(asc(modifiers.name));

  const modifiersByGroup = new Map<string, Modifier[]>();
  for (const row of modifierRows) {
    const list = modifiersByGroup.get(row.groupId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      nameUr: row.nameUr,
      priceDelta: paisa(row.priceDelta),
    });
    modifiersByGroup.set(row.groupId, list);
  }

  const groupsByItem = new Map<string, ModifierGroup[]>();
  for (const row of assignmentRows) {
    const list = groupsByItem.get(row.menuItemId) ?? [];
    list.push({
      id: row.groupId,
      name: row.groupName,
      nameUr: row.groupNameUr,
      minSelect: row.minSelect,
      maxSelect: row.maxSelect,
      isRequired: row.isRequired,
      modifiers: modifiersByGroup.get(row.groupId) ?? [],
    });
    groupsByItem.set(row.menuItemId, list);
  }

  const items = itemRows.map((row) => ({
    id: row.id,
    categoryId: row.categoryId,
    sku: row.sku,
    name: row.name,
    nameUr: row.nameUr,
    slug: slugify(row.name),
    description: row.description,
    descriptionUr: row.descriptionUr,
    imageKey: row.imageKey,
    basePrice: paisa(row.basePrice),
    taxClass: asTaxClassKey(row.taxClassKey),
    variants: variantsByItem.get(row.id) ?? [],
    modifierGroups: groupsByItem.get(row.id) ?? [],
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  }));

  if (!options?.popularFirst) return items;

  // The terminal's All view is a selling surface, so rank it by completed,
  // non-voided quantity. Items with no sales remain available at the end in
  // their configured menu order.
  const salesRows = await dbRead()
    .select({
      menuItemId: orderLines.menuItemId,
      quantity: sql<string>`coalesce(sum(${orderLines.qty}), 0)`,
    })
    .from(orderLines)
    .innerJoin(invoices, eq(invoices.orderId, orderLines.orderId))
    .where(
      and(
        inArray(orderLines.menuItemId, itemIds),
        isNull(orderLines.voidReason),
        isNull(orderLines.deletedAt),
        isNull(invoices.deletedAt),
      ),
    )
    .groupBy(orderLines.menuItemId)
    .orderBy(desc(sql`sum(${orderLines.qty})`));

  const rank = new Map(salesRows.map((row, index) => [row.menuItemId, index]));
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        (rank.get(a.item.id) ?? Number.MAX_SAFE_INTEGER) -
          (rank.get(b.item.id) ?? Number.MAX_SAFE_INTEGER) || a.index - b.index,
    )
    .map(({ item }) => item);
}

/**
 * The modifier builder's groups, each with its modifiers nested — global, not
 * scoped to one item. `modifier_groups` and `modifiers` carry no `sort_order`
 * column (unlike `item_modifier_groups`), so both list alphabetically; there
 * is nothing for a drag to persist here.
 */
export async function listModifierGroups(): Promise<ModifierGroup[]> {
  const groupRows = await dbRead()
    .select({
      id: modifierGroups.id,
      name: modifierGroups.name,
      nameUr: modifierGroups.nameUr,
      minSelect: modifierGroups.minSelect,
      maxSelect: modifierGroups.maxSelect,
      isRequired: modifierGroups.isRequired,
    })
    .from(modifierGroups)
    .where(isNull(modifierGroups.deletedAt))
    .orderBy(asc(modifierGroups.name));

  if (groupRows.length === 0) return [];
  const groupIds = groupRows.map((row) => row.id);

  const modifierRows = await dbRead()
    .select({
      id: modifiers.id,
      groupId: modifiers.groupId,
      name: modifiers.name,
      nameUr: modifiers.nameUr,
      priceDelta: modifiers.priceDelta,
    })
    .from(modifiers)
    .where(and(inArray(modifiers.groupId, groupIds), isNull(modifiers.deletedAt)))
    .orderBy(asc(modifiers.name));

  const modifiersByGroup = new Map<string, Modifier[]>();
  for (const row of modifierRows) {
    const list = modifiersByGroup.get(row.groupId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      nameUr: row.nameUr,
      priceDelta: paisa(row.priceDelta),
    });
    modifiersByGroup.set(row.groupId, list);
  }

  return groupRows.map((row) => ({ ...row, modifiers: modifiersByGroup.get(row.id) ?? [] }));
}
