import { and, eq, isNull } from 'drizzle-orm';
import { itemVariants } from '../src/schema';
import type { DbWrite } from '../src/client';
import type { Tx } from '../src/tx';

export interface VariantSeed {
  readonly name: string;
  readonly priceDelta: bigint;
  readonly isDefault: boolean;
}

/** Reconcile named seed variants without replacing IDs referenced by orders. */
export async function seedVariants(
  db: DbWrite | Tx,
  menuItemId: string,
  variants: readonly VariantSeed[],
) {
  for (const variant of variants) {
    const [existing] = await db
      .select({ id: itemVariants.id })
      .from(itemVariants)
      .where(
        and(
          eq(itemVariants.menuItemId, menuItemId),
          eq(itemVariants.name, variant.name),
          isNull(itemVariants.deletedAt),
        ),
      );
    if (existing) {
      await db
        .update(itemVariants)
        .set({ ...variant, updatedAt: new Date() })
        .where(eq(itemVariants.id, existing.id));
    } else {
      await db.insert(itemVariants).values({ menuItemId, ...variant });
    }
  }
}
