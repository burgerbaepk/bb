import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { closeDb, dbWrite } from '../src/client';
import { writeAudit } from '../src/audit';
import { itemModifierGroups, itemVariants, menuItems } from '../src/schema';
import { VARIANT_FAMILIES } from './menu';
import { seedVariants } from './menu-variants';

/** Targeted migration: live prices are authoritative; historical rows are retained. */
async function main() {
  const apply = process.argv.includes('--apply');
  const db = dbWrite();
  const summary = await db.transaction(async (tx) => {
    // Block concurrent menu edits until each family is fully converted.
    if (apply)
      await tx.execute(
        sql`lock table menu_items, item_variants, item_modifier_groups in share row exclusive mode`,
      );
    const result = [];
    for (const family of VARIANT_FAMILIES) {
      const skus = family.options.map(([sku]) => sku);
      const sources = await tx.select().from(menuItems).where(inArray(menuItems.sku, skus));
      const active = sources.filter((row) => row.deletedAt === null);
      const parent = active.find((row) => row.sku === skus[0]);
      if (!parent) throw new Error(`Missing parent for ${family.name}`);
      const currentVariants = await tx
        .select()
        .from(itemVariants)
        .where(and(eq(itemVariants.menuItemId, parent.id), isNull(itemVariants.deletedAt)));
      if (
        active.length === 1 &&
        parent.name === family.name &&
        currentVariants.length === family.options.length &&
        family.options.every(([, name]) => currentVariants.some((v) => v.name === name))
      ) {
        result.push({ name: family.name, status: 'already grouped' });
        continue;
      }
      if (active.length !== skus.length || currentVariants.length !== 0)
        throw new Error(`Partially converted or customized family: ${family.name}`);
      const ids = active.map((row) => row.id);
      const attachedVariants = await tx
        .select()
        .from(itemVariants)
        .where(and(inArray(itemVariants.menuItemId, ids), isNull(itemVariants.deletedAt)));
      const modifiers = await tx
        .select()
        .from(itemModifierGroups)
        .where(
          and(inArray(itemModifierGroups.menuItemId, ids), isNull(itemModifierGroups.deletedAt)),
        );
      if (attachedVariants.length || modifiers.length)
        throw new Error(`Review existing options for ${family.name} before grouping`);
      if (
        active.some(
          (row) =>
            row.categoryId !== parent.categoryId ||
            row.taxClassId !== parent.taxClassId ||
            row.isActive !== parent.isActive,
        )
      )
        throw new Error(`Incompatible settings in ${family.name}`);
      const variants = family.options.map(([sku, name], index) => {
        const source = active.find((row) => row.sku === sku);
        if (!source) throw new Error(`Missing source ${sku}`);
        return { name, priceDelta: source.basePrice - parent.basePrice, isDefault: index === 0 };
      });
      result.push({
        name: family.name,
        status: apply ? 'grouped' : 'planned',
        options: variants.map((variant) => ({
          name: variant.name,
          price: String((parent.basePrice + variant.priceDelta) / 100n),
        })),
      });
      if (!apply) continue;
      await seedVariants(tx, parent.id, variants);
      await tx
        .update(menuItems)
        .set({ name: family.name, updatedAt: new Date() })
        .where(eq(menuItems.id, parent.id));
      const retiredIds = ids.filter((id) => id !== parent.id);
      await tx
        .update(menuItems)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(inArray(menuItems.id, retiredIds));
      await writeAudit(
        tx,
        { ua: 'seeds/consolidate-menu.ts' },
        {
          entity: 'menu_items',
          entityId: parent.id,
          action: 'MENU_VARIANTS_CONSOLIDATED',
          before: active,
          after: {
            name: family.name,
            basePrice: parent.basePrice,
            variants,
            retiredIds,
            sourceSkus: skus,
          },
        },
      );
    }
    return result;
  });
  console.warn(JSON.stringify({ applied: apply, families: summary }, null, 2));
}
main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDb);
