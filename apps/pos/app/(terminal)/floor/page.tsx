import type { Metadata } from 'next';
import { FloorPlan } from '@/components/floor/FloorPlan';
import { currentTillIdentity } from '@/lib/auth/session';
import { listFloorChips, listTables, listZones } from '@/lib/floor/queries';

/**
 * Floor plan, service mode — BUILD-PLAN.md §9;
 * docs/runfiles/M09b-floor-live.md.
 *
 * Replaces the M04 mock with the real reads M08 (`listTables`/`listZones`)
 * and this milestone (`listFloorChips`) already built. `requireTillStaff()`
 * matches `(terminal)/page.tsx`'s own convention — this call succeeds in the
 * normal path since `(terminal)/layout.tsx` already gates the surface on an
 * identified till, and only re-derives what the layout established.
 */
export const metadata: Metadata = {
  title: 'Floor',
  robots: { index: false, follow: false },
};

export default async function Page() {
  const identity = await currentTillIdentity();
  if (identity === null) return null;
  const { viewer } = identity;
  const [zones, tables, chips] = await Promise.all([
    listZones(),
    listTables(),
    listFloorChips(viewer),
  ]);

  return (
    <div className="h-[calc(100dvh-3.5rem)]">
      <FloorPlan zones={zones} tables={tables} chips={chips} viewer={viewer} />
    </div>
  );
}
