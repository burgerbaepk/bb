import { MenuManager } from '@/components/admin/MenuManager';
import { requirePermissionPage } from '@/lib/auth/session';
import { listCategories, listMenuItems, listModifierGroups } from '@/lib/menu/queries';
import { resolveAssetUrl } from '@/lib/assets';

/**
 * Menu manager — BUILD-PLAN.md §5.3, §7.6; M08 runfile.
 *
 * Real reads replace `MOCK_MENU` here (M08's freeze-respecting scope: the
 * mock definitions themselves are untouched, and other apps/tests may still
 * import them). `MOCK_SETTING_VALUES` stays — the settings registry's write
 * path is a different slice of this milestone, carried forward from M07 and
 * still unbuilt, so the default HS code has nowhere real to come from yet.
 *
 * `resolveAssetUrl` is `server-only` and cannot run inside `MenuManager` (a
 * client component), so every item's image key is resolved to a URL here and
 * handed down as a plain map.
 */
export default async function Page() {
  await requirePermissionPage('menu.write');

  const [categories, items, modifierGroups] = await Promise.all([
    listCategories(),
    listMenuItems(),
    listModifierGroups(),
  ]);

  const imageUrls = Object.fromEntries(
    items.map((item) => [item.id, resolveAssetUrl(item.imageKey)]),
  );

  return (
    <MenuManager
      categories={categories}
      items={items}
      modifierGroups={modifierGroups}
      imageUrls={imageUrls}
    />
  );
}
