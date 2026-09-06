import { FloorEditor } from '@/components/admin/FloorEditor';
import { listFloor } from '@/lib/floor/queries';
import { requirePermissionPage } from '@/lib/auth/session';
import { resolveAssetUrl } from '@/lib/assets';

/**
 * Floor plan editor — BUILD-PLAN.md §9.4. `MANAGER` and above hold
 * `floor.write` (§14.1); anyone else is sent back to `/admin` with the denied
 * permission named in the query string, same as every other `requirePermissionPage`
 * screen.
 */
export default async function Page() {
  await requirePermissionPage('floor.write');
  const { zones, tables } = await listFloor();

  // `resolveAssetUrl` is `server-only` (it reads `R2_PUBLIC_BASE_URL`) and
  // cannot be called from `FloorEditor`, a client component — resolved here,
  // once per zone, and handed down as plain strings.
  const backgroundUrls = Object.fromEntries(
    zones.map((zone) => [zone.id, resolveAssetUrl(zone.backgroundImageKey)] as const),
  );

  return <FloorEditor zones={zones} tables={tables} backgroundUrls={backgroundUrls} />;
}
