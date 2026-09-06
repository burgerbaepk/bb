/**
 * Floor geometry bounds — BUILD-PLAN.md §9.4; docs/runfiles/M08-menu-floor-brand.md §3,
 * "Floor geometry is trusted from the client only as data, not as truth."
 *
 * `FloorEditor`'s own pointer maths already clamps `x + width <= gridCols` and
 * `y + height <= gridRows` while an operator drags a table — its doc comment is
 * explicit that "nothing downstream sees a pixel". That clamp runs against the
 * `gridCols`/`gridRows` the browser loaded minutes ago. A second admin can
 * shrink the same zone's grid in between, and a save from the stale tab must
 * not be able to persist a table hanging off the edge of a plan nobody can
 * then find it on — so the save action re-runs this check against the zone's
 * row in the database, immediately before writing.
 *
 * Deliberately free of `dbWrite`, `server-only`, and any request context: this
 * is the one function Gate G4 names as unit-tested, and a pure function over
 * plain data is the only way to test it without standing up a database or an
 * authenticated session.
 */

export interface GeometryLike {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ZoneBoundsLike {
  readonly id: string;
  readonly gridCols: number;
  readonly gridRows: number;
}

export interface TableForBoundsCheck {
  readonly code: string;
  readonly zoneId: string;
  readonly geometry: GeometryLike;
}

export interface BoundsViolation {
  readonly code: string;
  readonly zoneId: string;
  readonly reason: string;
}

/**
 * Checks a batch of tables against the zones they claim to belong to, keyed by
 * zone id. Returns the first violation found — naming the offending table's
 * code, per the runfile's "reject the whole batch... naming the offending
 * table" — or `null` if every table in the batch fits inside its zone.
 *
 * The caller is expected to reject the *entire* batch on any violation rather
 * than silently clamping or dropping the bad table: clamping would persist a
 * position the operator never saw on screen, which is worse than refusing the
 * save outright.
 */
export function findBoundsViolation(
  candidates: readonly TableForBoundsCheck[],
  zonesById: ReadonlyMap<string, ZoneBoundsLike>,
): BoundsViolation | null {
  for (const table of candidates) {
    const zone = zonesById.get(table.zoneId);
    if (zone === undefined) {
      return {
        code: table.code,
        zoneId: table.zoneId,
        reason: 'names a zone that no longer exists',
      };
    }

    const { x, y, width, height } = table.geometry;
    if (x < 0 || y < 0 || width <= 0 || height <= 0) {
      return {
        code: table.code,
        zoneId: zone.id,
        reason: 'has a negative position or a non-positive size',
      };
    }
    if (x + width > zone.gridCols || y + height > zone.gridRows) {
      return {
        code: table.code,
        zoneId: zone.id,
        reason: `extends beyond its zone's ${zone.gridCols}×${zone.gridRows} grid`,
      };
    }
  }

  return null;
}
