'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import {
  categories,
  dbWrite,
  itemModifierGroups,
  itemVariants,
  menuItems,
  modifierGroups,
  modifiers,
  taxClasses,
  writeAudit,
} from '@natech/db';
import { MenuItemDraftSchema } from '@natech/contracts';
import { parsePaisa } from '@natech/domain';
import { assertPermission, requestContext, requireOperator } from '../auth/session';
import { findTaxClassId, isSamePopulation, resequence, validateSelectRange } from './logic';

/**
 * Menu and modifier CRUD — BUILD-PLAN.md §5.3; M08 runfile "Menu CRUD" and
 * "Drag-reorder persistence".
 *
 * `dbWrite` only (R2) — everything here mutates. Reads for the same screens
 * live in `queries.ts` on `dbRead`; the presigned-upload mint that never
 * touches the database lives in `image-upload.ts`.
 *
 * Every action here is gated on `menu.write`, which the frozen seed grants to
 * `MANAGER` and `OWNER` (`packages/db/seeds/roles.ts`) — menu configuration
 * is not access control, so it sits apart from `staff.write`. The style
 * throughout — `requireOperator()` then `assertPermission()`, a
 * pre-checked clash query rather than a caught constraint error (CLAUDE.md's
 * traps), `writeAudit()` inside the same transaction as the mutation (R7) —
 * is `lib/auth/actions/staff.ts`'s, copied rather than reinvented.
 */

export interface MenuFormState {
  readonly error: string | null;
  readonly message: string | null;
}

/** A reorder or a row-level delete/attach button calls its action directly, not through a form. */
export interface ActionResult {
  readonly error: string | null;
}

function normalise(value: FormDataEntryValue | null): string | null {
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Parse the rupee-decimal text a form field carries (`"530.00"`, `"-50"`) into
 * paisa. Deliberately not `parsePaisa` called inline at every call site: the
 * one place that turns a bad string into a form error rather than a thrown
 * exception the framework would render as a crash page.
 */
function parsePriceField(
  raw: FormDataEntryValue | null,
  blankIsZero: boolean,
): { ok: true; wire: string } | { ok: false; error: string } {
  const text = String(raw ?? '').trim();
  if (text === '' && blankIsZero) return { ok: true, wire: '0' };
  try {
    return { ok: true, wire: parsePaisa(text).toString() };
  } catch {
    return { ok: false, error: 'Enter a price in rupees, e.g. 530.00 or -50.00.' };
  }
}

/* --------------------------------------------------------------- categories */

const CategoryFields = {
  name: z.string().trim().min(1, 'A category needs a name.'),
  nameUr: z.string().nullable(),
  colour: z.string().nullable(),
};

const CreateCategoryInput = z.object(CategoryFields);

export async function createCategoryAction(
  _previous: MenuFormState,
  form: FormData,
): Promise<MenuFormState> {
  const operator = await requireOperator();
  assertPermission(operator, 'menu.write');

  const parsed = CreateCategoryInput.safeParse({
    name: form.get('name'),
    nameUr: normalise(form.get('nameUr')),
    colour: normalise(form.get('colour')),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form.', message: null };
  }

  const db = dbWrite();

  // `categories_name_idx` is a partial unique index on `name` (R6).
  // Pre-checked for a clean form error, the shape `createStaffAction` uses,
  // rather than surfacing the wrapped Postgres error Drizzle hangs off
  // `.cause`, not `.message`.
  const clash = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.name, parsed.data.name), isNull(categories.deletedAt)));
  if (clash[0] !== undefined) {
    return { error: 'A category with that name already exists.', message: null };
  }

  const siblings = await db
    .select({ sortOrder: categories.sortOrder })
    .from(categories)
    .where(isNull(categories.deletedAt));
  const nextSortOrder = siblings.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;

  const context = await requestContext();

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(categories)
      .values({
        name: parsed.data.name,
        nameUr: parsed.data.nameUr,
        colour: parsed.data.colour,
        sortOrder: nextSortOrder,
      })
      .returning({ id: categories.id });
    const created = inserted[0];
    if (created === undefined) throw new Error('Inserting the category returned no row.');

    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'categories',
        entityId: created.id,
        action: 'CATEGORY_CREATED',
        after: { name: parsed.data.name },
      },
    );
  });

  revalidatePath('/admin/menu');
  return { error: null, message: `${parsed.data.name} created.` };
}

const UpdateCategoryInput = z.object({ id: z.uuid(), isActive: z.boolean(), ...CategoryFields });

export async function updateCategoryAction(
  _previous: MenuFormState,
  form: FormData,
): Promise<MenuFormState> {
  const operator = await requireOperator();
  assertPermission(operator, 'menu.write');

  const parsed = UpdateCategoryInput.safeParse({
    id: form.get('id'),
    name: form.get('name'),
    nameUr: normalise(form.get('nameUr')),
    colour: normalise(form.get('colour')),
    isActive: form.get('isActive') === 'true',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form.', message: null };
  }

  const db = dbWrite();

  const before = await db
    .select({ name: categories.name, isActive: categories.isActive })
    .from(categories)
    .where(and(eq(categories.id, parsed.data.id), isNull(categories.deletedAt)));
  if (before[0] === undefined) return { error: 'That category no longer exists.', message: null };

  const clash = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.name, parsed.data.name),
        isNull(categories.deletedAt),
        ne(categories.id, parsed.data.id),
      ),
    );
  if (clash[0] !== undefined) {
    return { error: 'A category with that name already exists.', message: null };
  }

  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx
      .update(categories)
      .set({
        name: parsed.data.name,
        nameUr: parsed.data.nameUr,
        colour: parsed.data.colour,
        isActive: parsed.data.isActive,
        updatedAt: new Date(),
      })
      .where(eq(categories.id, parsed.data.id));

    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'categories',
        entityId: parsed.data.id,
        action: 'CATEGORY_UPDATED',
        before: before[0],
        after: { name: parsed.data.name, isActive: parsed.data.isActive },
      },
    );
  });

  revalidatePath('/admin/menu');
  return { error: null, message: `${parsed.data.name} saved.` };
}

const DeleteCategoryInput = z.object({ id: z.uuid() });

/**
 * R6 — a real soft delete, `deleted_at` set. Unlike `pos_terminals`'
 * "remove means deactivate" (its own screen still points `terminal_id`
 * references at the row), the G2 gate names category explicitly, and a
 * deleted category frees its name for reuse under the partial unique index
 * the way nothing else on this screen needs to.
 */
export async function deleteCategoryAction(
  _previous: MenuFormState,
  form: FormData,
): Promise<MenuFormState> {
  const operator = await requireOperator();
  assertPermission(operator, 'menu.write');

  const parsed = DeleteCategoryInput.safeParse({ id: form.get('id') });
  if (!parsed.success) return { error: 'Check the form.', message: null };

  const db = dbWrite();

  const before = await db
    .select({ name: categories.name })
    .from(categories)
    .where(and(eq(categories.id, parsed.data.id), isNull(categories.deletedAt)));
  if (before[0] === undefined) return { error: 'That category no longer exists.', message: null };

  const activeItems = await db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(and(eq(menuItems.categoryId, parsed.data.id), isNull(menuItems.deletedAt)))
    .limit(1);
  if (activeItems[0] !== undefined) {
    return { error: 'Move or delete every item in this category first.', message: null };
  }

  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx
      .update(categories)
      .set({ deletedAt: new Date() })
      .where(eq(categories.id, parsed.data.id));
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'categories',
        entityId: parsed.data.id,
        action: 'CATEGORY_DELETED',
        before: before[0],
      },
    );
  });

  revalidatePath('/admin/menu');
  return { error: null, message: `${before[0].name} deleted.` };
}

/** Not a form action — called directly from `MenuManager`'s drag handlers. */
export async function reorderCategoriesAction(
  orderedIds: readonly string[],
): Promise<ActionResult> {
  const operator = await requireOperator();
  assertPermission(operator, 'menu.write');
  if (orderedIds.length === 0) return { error: null };

  const db = dbWrite();
  const current = await db
    .select({ id: categories.id })
    .from(categories)
    .where(isNull(categories.deletedAt));
  if (
    !isSamePopulation(
      current.map((row) => row.id),
      orderedIds,
    )
  ) {
    return { error: 'The category list has changed. Reload and try again.' };
  }

  const context = await requestContext();

  await db.transaction(async (tx) => {
    for (const entry of resequence(orderedIds)) {
      await tx
        .update(categories)
        .set({ sortOrder: entry.sortOrder, updatedAt: new Date() })
        .where(eq(categories.id, entry.id));
    }
    // One audit row for the whole reorder (the runfile's decision), not one
    // per category.
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      { entity: 'categories', action: 'CATEGORIES_REORDERED', after: { order: orderedIds } },
    );
  });

  revalidatePath('/admin/menu');
  return { error: null };
}

/* --------------------------------------------------------------- menu items */

const MenuItemFormInput = MenuItemDraftSchema.extend({ imageKey: z.string().nullable() });

function buildItemInput(form: FormData, basePriceWire: string) {
  return {
    categoryId: form.get('categoryId'),
    sku: normalise(form.get('sku')),
    name: form.get('name'),
    nameUr: normalise(form.get('nameUr')),
    description: normalise(form.get('description')),
    descriptionUr: normalise(form.get('descriptionUr')),
    basePrice: basePriceWire,
    taxClass: form.get('taxClass'),
    isActive: form.get('isActive') === 'true',
    imageKey: normalise(form.get('imageKey')),
  };
}

/**
 * §5.3 — resolve the wire's `taxClass` key to `menu_items.tax_class_id`,
 * the same move `createStaffAction` makes for a role key. Every seeded class
 * is fetched (never more than three rows) so the "unknown key" branch is
 * `findTaxClassId`, a pure lookup `logic.test.ts` can assert on directly.
 */
async function resolveTaxClassId(
  db: ReturnType<typeof dbWrite>,
  key: z.infer<typeof MenuItemDraftSchema>['taxClass'],
): Promise<string | null> {
  const rows = await db
    .select({ id: taxClasses.id, key: taxClasses.key })
    .from(taxClasses)
    .where(isNull(taxClasses.deletedAt));
  return findTaxClassId(rows, key);
}

export async function createMenuItemAction(
  _previous: MenuFormState,
  form: FormData,
): Promise<MenuFormState> {
  const operator = await requireOperator();
  assertPermission(operator, 'menu.write');

  const price = parsePriceField(form.get('basePrice'), false);
  if (!price.ok) return { error: price.error, message: null };

  const parsed = MenuItemFormInput.safeParse(buildItemInput(form, price.wire));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form.', message: null };
  }

  const db = dbWrite();

  const taxClassId = await resolveTaxClassId(db, parsed.data.taxClass);
  if (taxClassId === null) {
    return { error: 'That tax class is not configured. Run pnpm db:seed.', message: null };
  }

  if (parsed.data.sku !== null) {
    const clash = await db
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(and(eq(menuItems.sku, parsed.data.sku), isNull(menuItems.deletedAt)));
    if (clash[0] !== undefined)
      return { error: 'Another item already uses that SKU.', message: null };
  }

  const siblings = await db
    .select({ sortOrder: menuItems.sortOrder })
    .from(menuItems)
    .where(and(eq(menuItems.categoryId, parsed.data.categoryId), isNull(menuItems.deletedAt)));
  const nextSortOrder = siblings.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;

  const context = await requestContext();

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(menuItems)
      .values({
        categoryId: parsed.data.categoryId,
        sku: parsed.data.sku,
        name: parsed.data.name,
        nameUr: parsed.data.nameUr,
        description: parsed.data.description,
        descriptionUr: parsed.data.descriptionUr,
        imageKey: parsed.data.imageKey,
        basePrice: BigInt(parsed.data.basePrice),
        taxClassId,
        sortOrder: nextSortOrder,
        isActive: parsed.data.isActive,
      })
      .returning({ id: menuItems.id });
    const created = inserted[0];
    if (created === undefined) throw new Error('Inserting the menu item returned no row.');

    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'menu_items',
        entityId: created.id,
        action: 'MENU_ITEM_CREATED',
        after: {
          name: parsed.data.name,
          categoryId: parsed.data.categoryId,
          basePrice: parsed.data.basePrice,
        },
      },
    );
  });

  revalidatePath('/admin/menu');
  return { error: null, message: `${parsed.data.name} created.` };
}

const MenuItemUpdateFormInput = MenuItemFormInput.extend({ id: z.uuid() });

export async function updateMenuItemAction(
  _previous: MenuFormState,
  form: FormData,
): Promise<MenuFormState> {
  const operator = await requireOperator();
  assertPermission(operator, 'menu.write');

  const price = parsePriceField(form.get('basePrice'), false);
  if (!price.ok) return { error: price.error, message: null };

  const parsed = MenuItemUpdateFormInput.safeParse({
    id: form.get('id'),
    ...buildItemInput(form, price.wire),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form.', message: null };
  }

  const db = dbWrite();

  const before = await db
    .select({
      name: menuItems.name,
      categoryId: menuItems.categoryId,
      sortOrder: menuItems.sortOrder,
    })
    .from(menuItems)
    .where(and(eq(menuItems.id, parsed.data.id), isNull(menuItems.deletedAt)));
  if (before[0] === undefined) return { error: 'That item no longer exists.', message: null };

  const taxClassId = await resolveTaxClassId(db, parsed.data.taxClass);
  if (taxClassId === null) {
    return { error: 'That tax class is not configured. Run pnpm db:seed.', message: null };
  }

  if (parsed.data.sku !== null) {
    const clash = await db
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(
        and(
          eq(menuItems.sku, parsed.data.sku),
          isNull(menuItems.deletedAt),
          ne(menuItems.id, parsed.data.id),
        ),
      );
    if (clash[0] !== undefined)
      return { error: 'Another item already uses that SKU.', message: null };
  }

  // Moved to a different category: append to the end of the new one rather
  // than keep an ordinal that meant something in the old list.
  let sortOrder = before[0].sortOrder;
  if (before[0].categoryId !== parsed.data.categoryId) {
    const siblings = await db
      .select({ sortOrder: menuItems.sortOrder })
      .from(menuItems)
      .where(and(eq(menuItems.categoryId, parsed.data.categoryId), isNull(menuItems.deletedAt)));
    sortOrder = siblings.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
  }

  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx
      .update(menuItems)
      .set({
        categoryId: parsed.data.categoryId,
        sku: parsed.data.sku,
        name: parsed.data.name,
        nameUr: parsed.data.nameUr,
        description: parsed.data.description,
        descriptionUr: parsed.data.descriptionUr,
        imageKey: parsed.data.imageKey,
        basePrice: BigInt(parsed.data.basePrice),
        taxClassId,
        sortOrder,
        isActive: parsed.data.isActive,
        updatedAt: new Date(),
      })
      .where(eq(menuItems.id, parsed.data.id));

    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'menu_items',
        entityId: parsed.data.id,
        action: 'MENU_ITEM_UPDATED',
        before: before[0],
        after: {
          name: parsed.data.name,
          categoryId: parsed.data.categoryId,
          basePrice: parsed.data.basePrice,
        },
      },
    );
  });

  revalidatePath('/admin/menu');
  return { error: null, message: `${parsed.data.name} saved.` };
}

const DeleteMenuItemInput = z.object({ id: z.uuid() });

export async function deleteMenuItemAction(
  _previous: MenuFormState,
  form: FormData,
): Promise<MenuFormState> {
  const operator = await requireOperator();
  assertPermission(operator, 'menu.write');

  const parsed = DeleteMenuItemInput.safeParse({ id: form.get('id') });
  if (!parsed.success) return { error: 'Check the form.', message: null };

  const db = dbWrite();

  const before = await db
    .select({ name: menuItems.name })
    .from(menuItems)
    .where(and(eq(menuItems.id, parsed.data.id), isNull(menuItems.deletedAt)));
  if (before[0] === undefined) return { error: 'That item no longer exists.', message: null };

  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx
      .update(menuItems)
      .set({ deletedAt: new Date() })
      .where(eq(menuItems.id, parsed.data.id));
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'menu_items',
        entityId: parsed.data.id,
        action: 'MENU_ITEM_DELETED',
        before: before[0],
      },
    );
  });

  revalidatePath('/admin/menu');
  return { error: null, message: `${before[0].name} deleted.` };
}

/** Not a form action — called directly from `MenuManager`'s drag handlers. */
export async function reorderMenuItemsAction(
  categoryId: string,
  orderedIds: readonly string[],
): Promise<ActionResult> {
  const operator = await requireOperator();
  assertPermission(operator, 'menu.write');
  if (orderedIds.length === 0) return { error: null };

  const db = dbWrite();
  const current = await db
    .select({ id: menuItems.id })
    .from(menuItems)
    .where(and(eq(menuItems.categoryId, categoryId), isNull(menuItems.deletedAt)));
  if (
    !isSamePopulation(
      current.map((row) => row.id),
      orderedIds,
    )
  ) {
    return { error: 'This category’s items have changed. Reload and try again.' };
  }

  const context = await requestContext();

  await db.transaction(async (tx) => {
    for (const entry of resequence(orderedIds)) {
      await tx
        .update(menuItems)
        .set({ sortOrder: entry.sortOrder, updatedAt: new Date() })
        .where(eq(menuItems.id, entry.id));
    }
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'menu_items',
        action: 'MENU_ITEMS_REORDERED',
        after: { categoryId, order: orderedIds },
      },
    );
  });

  revalidatePath('/admin/menu');
  return { error: null };
}

/* ------------------------------------------------------------------ variants */

const AddVariantInput = z.object({
  menuItemId: z.uuid(),
  name: z.string().trim().min(1, 'A variant needs a name.'),
  nameUr: z.string().nullable(),
  isDefault: z.boolean(),
});

export async function addVariantAction(
  _previous: MenuFormState,
  form: FormData,
): Promise<MenuFormState> {
  const operator = await requireOperator();
  assertPermission(operator, 'menu.write');

  const price = parsePriceField(form.get('priceDelta'), true);
  if (!price.ok) return { error: price.error, message: null };

  const parsed = AddVariantInput.safeParse({
    menuItemId: form.get('menuItemId'),
    name: form.get('name'),
    nameUr: normalise(form.get('nameUr')),
    isDefault: form.get('isDefault') === 'true',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form.', message: null };
  }

  const db = dbWrite();

  // `item_variants_unique_idx` — partial unique on (menu_item_id, name).
  const clash = await db
    .select({ id: itemVariants.id })
    .from(itemVariants)
    .where(
      and(
        eq(itemVariants.menuItemId, parsed.data.menuItemId),
        eq(itemVariants.name, parsed.data.name),
        isNull(itemVariants.deletedAt),
      ),
    );
  if (clash[0] !== undefined) {
    return { error: 'This item already has a variant with that name.', message: null };
  }

  const context = await requestContext();
  const priceDelta = BigInt(price.wire);

  await db.transaction(async (tx) => {
    if (parsed.data.isDefault) {
      // Exactly one default per item — `ItemVariantSchema`'s own comment
      // calls the default "normally zero", which only means something if
      // there is one.
      await tx
        .update(itemVariants)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(eq(itemVariants.menuItemId, parsed.data.menuItemId), isNull(itemVariants.deletedAt)),
        );
    }

    const inserted = await tx
      .insert(itemVariants)
      .values({
        menuItemId: parsed.data.menuItemId,
        name: parsed.data.name,
        nameUr: parsed.data.nameUr,
        priceDelta,
        isDefault: parsed.data.isDefault,
      })
      .returning({ id: itemVariants.id });
    const created = inserted[0];
    if (created === undefined) throw new Error('Inserting the variant returned no row.');

    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'item_variants',
        entityId: created.id,
        action: 'ITEM_VARIANT_CREATED',
        after: {
          menuItemId: parsed.data.menuItemId,
          name: parsed.data.name,
          priceDelta: priceDelta.toString(),
        },
      },
    );
  });

  revalidatePath('/admin/menu');
  return { error: null, message: `${parsed.data.name} added.` };
}

/** Not a form action — the item editor's remove button calls this directly. */
export async function removeVariantAction(variantId: string): Promise<ActionResult> {
  const operator = await requireOperator();
  assertPermission(operator, 'menu.write');

  const db = dbWrite();
  const before = await db
    .select({ name: itemVariants.name })
    .from(itemVariants)
    .where(and(eq(itemVariants.id, variantId), isNull(itemVariants.deletedAt)));
  if (before[0] === undefined) return { error: 'That variant no longer exists.' };

  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx
      .update(itemVariants)
      .set({ deletedAt: new Date() })
      .where(eq(itemVariants.id, variantId));
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'item_variants',
        entityId: variantId,
        action: 'ITEM_VARIANT_DELETED',
        before: before[0],
      },
    );
  });

  revalidatePath('/admin/menu');
  return { error: null };
}

/* ---------------------------------------------------- item ↔ modifier group */

/** Not a form action — the item editor's "attach" control calls this directly. */
export async function assignModifierGroupAction(
  menuItemId: string,
  groupId: string,
): Promise<ActionResult> {
  const operator = await requireOperator();
  assertPermission(operator, 'menu.write');

  const db = dbWrite();

  // `item_modifier_groups_unique_idx` — partial unique on (menu_item_id, group_id).
  const clash = await db
    .select({ id: itemModifierGroups.id })
    .from(itemModifierGroups)
    .where(
      and(
        eq(itemModifierGroups.menuItemId, menuItemId),
        eq(itemModifierGroups.groupId, groupId),
        isNull(itemModifierGroups.deletedAt),
      ),
    );
  if (clash[0] !== undefined) return { error: 'That group is already attached to this item.' };

  const siblings = await db
    .select({ sortOrder: itemModifierGroups.sortOrder })
    .from(itemModifierGroups)
    .where(
      and(eq(itemModifierGroups.menuItemId, menuItemId), isNull(itemModifierGroups.deletedAt)),
    );
  const nextSortOrder = siblings.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;

  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx.insert(itemModifierGroups).values({ menuItemId, groupId, sortOrder: nextSortOrder });
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'item_modifier_groups',
        action: 'ITEM_MODIFIER_GROUP_ASSIGNED',
        after: { menuItemId, groupId },
      },
    );
  });

  revalidatePath('/admin/menu');
  return { error: null };
}

/** Not a form action — the item editor's remove button calls this directly. */
export async function removeModifierGroupFromItemAction(
  menuItemId: string,
  groupId: string,
): Promise<ActionResult> {
  const operator = await requireOperator();
  assertPermission(operator, 'menu.write');

  const db = dbWrite();
  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx
      .update(itemModifierGroups)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(itemModifierGroups.menuItemId, menuItemId),
          eq(itemModifierGroups.groupId, groupId),
          isNull(itemModifierGroups.deletedAt),
        ),
      );
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'item_modifier_groups',
        action: 'ITEM_MODIFIER_GROUP_REMOVED',
        after: { menuItemId, groupId },
      },
    );
  });

  revalidatePath('/admin/menu');
  return { error: null };
}

/** Not a form action — called directly from `MenuManager`'s drag handlers. */
export async function reorderItemModifierGroupsAction(
  menuItemId: string,
  orderedGroupIds: readonly string[],
): Promise<ActionResult> {
  const operator = await requireOperator();
  assertPermission(operator, 'menu.write');
  if (orderedGroupIds.length === 0) return { error: null };

  const db = dbWrite();
  const current = await db
    .select({ groupId: itemModifierGroups.groupId })
    .from(itemModifierGroups)
    .where(
      and(eq(itemModifierGroups.menuItemId, menuItemId), isNull(itemModifierGroups.deletedAt)),
    );
  if (
    !isSamePopulation(
      current.map((row) => row.groupId),
      orderedGroupIds,
    )
  ) {
    return { error: 'This item’s modifier groups have changed. Reload and try again.' };
  }

  const context = await requestContext();

  await db.transaction(async (tx) => {
    for (const entry of resequence(orderedGroupIds)) {
      await tx
        .update(itemModifierGroups)
        .set({ sortOrder: entry.sortOrder, updatedAt: new Date() })
        .where(
          and(
            eq(itemModifierGroups.menuItemId, menuItemId),
            eq(itemModifierGroups.groupId, entry.id),
          ),
        );
    }
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'item_modifier_groups',
        action: 'ITEM_MODIFIER_GROUPS_REORDERED',
        after: { menuItemId, order: orderedGroupIds },
      },
    );
  });

  revalidatePath('/admin/menu');
  return { error: null };
}

/* ------------------------------------------------------------ modifier groups */

const ModifierGroupFields = {
  name: z.string().trim().min(1, 'A group needs a name.'),
  nameUr: z.string().nullable(),
  minSelect: z.coerce.number().int().nonnegative('Minimum choices must be zero or more.'),
  maxSelect: z.coerce.number().int().positive('Maximum choices must be at least one.'),
  isRequired: z.boolean(),
};

const CreateModifierGroupInput = z.object(ModifierGroupFields);

export async function createModifierGroupAction(
  _previous: MenuFormState,
  form: FormData,
): Promise<MenuFormState> {
  const operator = await requireOperator();
  assertPermission(operator, 'menu.write');

  const parsed = CreateModifierGroupInput.safeParse({
    name: form.get('name'),
    nameUr: normalise(form.get('nameUr')),
    minSelect: form.get('minSelect'),
    maxSelect: form.get('maxSelect'),
    isRequired: form.get('isRequired') === 'true',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form.', message: null };
  }

  const rangeError = validateSelectRange(parsed.data);
  if (rangeError !== null) return { error: rangeError, message: null };

  const db = dbWrite();
  const context = await requestContext();

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(modifierGroups)
      .values({
        name: parsed.data.name,
        nameUr: parsed.data.nameUr,
        minSelect: parsed.data.minSelect,
        maxSelect: parsed.data.maxSelect,
        isRequired: parsed.data.isRequired,
      })
      .returning({ id: modifierGroups.id });
    const created = inserted[0];
    if (created === undefined) throw new Error('Inserting the modifier group returned no row.');

    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'modifier_groups',
        entityId: created.id,
        action: 'MODIFIER_GROUP_CREATED',
        after: parsed.data,
      },
    );
  });

  revalidatePath('/admin/modifiers');
  return { error: null, message: `${parsed.data.name} created.` };
}

const UpdateModifierGroupInput = z.object({ id: z.uuid(), ...ModifierGroupFields });

export async function updateModifierGroupAction(
  _previous: MenuFormState,
  form: FormData,
): Promise<MenuFormState> {
  const operator = await requireOperator();
  assertPermission(operator, 'menu.write');

  const parsed = UpdateModifierGroupInput.safeParse({
    id: form.get('id'),
    name: form.get('name'),
    nameUr: normalise(form.get('nameUr')),
    minSelect: form.get('minSelect'),
    maxSelect: form.get('maxSelect'),
    isRequired: form.get('isRequired') === 'true',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form.', message: null };
  }

  const rangeError = validateSelectRange(parsed.data);
  if (rangeError !== null) return { error: rangeError, message: null };

  const db = dbWrite();

  const before = await db
    .select({
      name: modifierGroups.name,
      minSelect: modifierGroups.minSelect,
      maxSelect: modifierGroups.maxSelect,
      isRequired: modifierGroups.isRequired,
    })
    .from(modifierGroups)
    .where(and(eq(modifierGroups.id, parsed.data.id), isNull(modifierGroups.deletedAt)));
  if (before[0] === undefined) return { error: 'That group no longer exists.', message: null };

  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx
      .update(modifierGroups)
      .set({
        name: parsed.data.name,
        nameUr: parsed.data.nameUr,
        minSelect: parsed.data.minSelect,
        maxSelect: parsed.data.maxSelect,
        isRequired: parsed.data.isRequired,
        updatedAt: new Date(),
      })
      .where(eq(modifierGroups.id, parsed.data.id));

    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'modifier_groups',
        entityId: parsed.data.id,
        action: 'MODIFIER_GROUP_UPDATED',
        before: before[0],
        after: parsed.data,
      },
    );
  });

  revalidatePath('/admin/modifiers');
  revalidatePath('/admin/menu');
  return { error: null, message: `${parsed.data.name} saved.` };
}

const DeleteModifierGroupInput = z.object({ id: z.uuid() });

export async function deleteModifierGroupAction(
  _previous: MenuFormState,
  form: FormData,
): Promise<MenuFormState> {
  const operator = await requireOperator();
  assertPermission(operator, 'menu.write');

  const parsed = DeleteModifierGroupInput.safeParse({ id: form.get('id') });
  if (!parsed.success) return { error: 'Check the form.', message: null };

  const db = dbWrite();

  const before = await db
    .select({ name: modifierGroups.name })
    .from(modifierGroups)
    .where(and(eq(modifierGroups.id, parsed.data.id), isNull(modifierGroups.deletedAt)));
  if (before[0] === undefined) return { error: 'That group no longer exists.', message: null };

  const attached = await db
    .select({ id: itemModifierGroups.id })
    .from(itemModifierGroups)
    .where(
      and(eq(itemModifierGroups.groupId, parsed.data.id), isNull(itemModifierGroups.deletedAt)),
    )
    .limit(1);
  if (attached[0] !== undefined) {
    return { error: 'Detach this group from every item before deleting it.', message: null };
  }

  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx
      .update(modifierGroups)
      .set({ deletedAt: new Date() })
      .where(eq(modifierGroups.id, parsed.data.id));
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'modifier_groups',
        entityId: parsed.data.id,
        action: 'MODIFIER_GROUP_DELETED',
        before: before[0],
      },
    );
  });

  revalidatePath('/admin/modifiers');
  return { error: null, message: `${before[0].name} deleted.` };
}

/* ----------------------------------------------------------------- modifiers */

const AddModifierInput = z.object({
  groupId: z.uuid(),
  name: z.string().trim().min(1, 'A modifier needs a name.'),
  nameUr: z.string().nullable(),
});

export async function addModifierAction(
  _previous: MenuFormState,
  form: FormData,
): Promise<MenuFormState> {
  const operator = await requireOperator();
  assertPermission(operator, 'menu.write');

  const price = parsePriceField(form.get('priceDelta'), true);
  if (!price.ok) return { error: price.error, message: null };

  const parsed = AddModifierInput.safeParse({
    groupId: form.get('groupId'),
    name: form.get('name'),
    nameUr: normalise(form.get('nameUr')),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the form.', message: null };
  }

  const db = dbWrite();
  const context = await requestContext();
  const priceDelta = BigInt(price.wire);

  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(modifiers)
      .values({
        groupId: parsed.data.groupId,
        name: parsed.data.name,
        nameUr: parsed.data.nameUr,
        priceDelta,
      })
      .returning({ id: modifiers.id });
    const created = inserted[0];
    if (created === undefined) throw new Error('Inserting the modifier returned no row.');

    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      {
        entity: 'modifiers',
        entityId: created.id,
        action: 'MODIFIER_CREATED',
        after: {
          groupId: parsed.data.groupId,
          name: parsed.data.name,
          priceDelta: priceDelta.toString(),
        },
      },
    );
  });

  revalidatePath('/admin/modifiers');
  revalidatePath('/admin/menu');
  return { error: null, message: `${parsed.data.name} added.` };
}

/** Not a form action — the "remove modifier" button in `ModifierBuilder` calls this directly. */
export async function removeModifierAction(modifierId: string): Promise<ActionResult> {
  const operator = await requireOperator();
  assertPermission(operator, 'menu.write');

  const db = dbWrite();
  const before = await db
    .select({ name: modifiers.name })
    .from(modifiers)
    .where(and(eq(modifiers.id, modifierId), isNull(modifiers.deletedAt)));
  if (before[0] === undefined) return { error: 'That modifier no longer exists.' };

  const context = await requestContext();

  await db.transaction(async (tx) => {
    await tx.update(modifiers).set({ deletedAt: new Date() }).where(eq(modifiers.id, modifierId));
    await writeAudit(
      tx,
      { actorId: operator.id, ip: context.ip ?? undefined, ua: context.ua ?? undefined },
      { entity: 'modifiers', entityId: modifierId, action: 'MODIFIER_DELETED', before: before[0] },
    );
  });

  revalidatePath('/admin/modifiers');
  revalidatePath('/admin/menu');
  return { error: null };
}
