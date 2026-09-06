import { describe, expect, it } from 'vitest';
import { findBoundsViolation, type TableForBoundsCheck, type ZoneBoundsLike } from './bounds';

/**
 * Gate G4 (docs/runfiles/M08-menu-floor-brand.md): "A table's saved geometry
 * never exceeds its zone's grid bounds, even from a stale client." This is the
 * only server-side check the runfile calls out by name, so it gets its own
 * unit tests rather than relying on coverage from the action's integration
 * behaviour.
 */

const ZONE: ZoneBoundsLike = { id: 'zone-1', gridCols: 40, gridRows: 24 };
const ZONES = new Map([[ZONE.id, ZONE]]);

function table(overrides: Partial<TableForBoundsCheck> = {}): TableForBoundsCheck {
  return {
    code: 'T1',
    zoneId: ZONE.id,
    geometry: { x: 0, y: 0, width: 3, height: 3 },
    ...overrides,
  };
}

describe('findBoundsViolation', () => {
  it('passes a table that exactly fills the grid', () => {
    const exact = table({ geometry: { x: 0, y: 0, width: 40, height: 24 } });
    expect(findBoundsViolation([exact], ZONES)).toBeNull();
  });

  it('passes an ordinary table well inside the grid', () => {
    expect(findBoundsViolation([table()], ZONES)).toBeNull();
  });

  it('fails a table one cell over on the right edge', () => {
    const overRight = table({ geometry: { x: 38, y: 0, width: 3, height: 3 } }); // 38+3=41 > 40
    const violation = findBoundsViolation([overRight], ZONES);
    expect(violation).not.toBeNull();
    expect(violation?.code).toBe('T1');
  });

  it('fails a table one cell over on the bottom edge', () => {
    const overBottom = table({ geometry: { x: 0, y: 22, width: 3, height: 3 } }); // 22+3=25 > 24
    expect(findBoundsViolation([overBottom], ZONES)).not.toBeNull();
  });

  it('fails a table one cell over on the left edge (negative x)', () => {
    const overLeft = table({ geometry: { x: -1, y: 0, width: 3, height: 3 } });
    expect(findBoundsViolation([overLeft], ZONES)).not.toBeNull();
  });

  it('fails a table one cell over on the top edge (negative y)', () => {
    const overTop = table({ geometry: { x: 0, y: -1, width: 3, height: 3 } });
    expect(findBoundsViolation([overTop], ZONES)).not.toBeNull();
  });

  it('fails a table with a non-positive width or height', () => {
    expect(
      findBoundsViolation([table({ geometry: { x: 0, y: 0, width: 0, height: 3 } })], ZONES),
    ).not.toBeNull();
    expect(
      findBoundsViolation([table({ geometry: { x: 0, y: 0, width: 3, height: 0 } })], ZONES),
    ).not.toBeNull();
  });

  it('fails a table naming a zone that is not in the map — a stale client cannot forge a zone id either', () => {
    const orphan = table({ zoneId: 'zone-does-not-exist' });
    const violation = findBoundsViolation([orphan], ZONES);
    expect(violation).not.toBeNull();
    expect(violation?.code).toBe('T1');
  });

  it('rejects the whole batch and names the offender when one table among several is bad', () => {
    const good1 = table({ code: 'A1', geometry: { x: 0, y: 0, width: 3, height: 3 } });
    const bad = table({ code: 'BAD', geometry: { x: 39, y: 0, width: 3, height: 3 } }); // 39+3=42 > 40
    const good2 = table({ code: 'A2', geometry: { x: 10, y: 10, width: 3, height: 3 } });

    const violation = findBoundsViolation([good1, bad, good2], ZONES);
    expect(violation).not.toBeNull();
    expect(violation?.code).toBe('BAD');
  });

  it('a batch where every table is good passes as a whole', () => {
    const good1 = table({ code: 'A1', geometry: { x: 0, y: 0, width: 3, height: 3 } });
    const good2 = table({ code: 'A2', geometry: { x: 10, y: 10, width: 3, height: 3 } });
    const good3 = table({ code: 'A3', geometry: { x: 37, y: 21, width: 3, height: 3 } }); // exact corner fit
    expect(findBoundsViolation([good1, good2, good3], ZONES)).toBeNull();
  });

  it('checks a table against its own zone when several zones are in play', () => {
    const small: ZoneBoundsLike = { id: 'zone-2', gridCols: 5, gridRows: 5 };
    const zones = new Map([
      [ZONE.id, ZONE],
      [small.id, small],
    ]);
    // Fits the big zone but not the small one.
    const inBigZone = table({ zoneId: ZONE.id, geometry: { x: 0, y: 0, width: 5, height: 5 } });
    const inSmallZone = table({
      code: 'S1',
      zoneId: small.id,
      geometry: { x: 0, y: 0, width: 5, height: 5 },
    });
    expect(findBoundsViolation([inBigZone, inSmallZone], zones)).toBeNull();

    const overflowsSmallZone = table({
      code: 'S2',
      zoneId: small.id,
      geometry: { x: 3, y: 3, width: 3, height: 3 },
    });
    const violation = findBoundsViolation([inBigZone, overflowsSmallZone], zones);
    expect(violation?.code).toBe('S2');
  });
});
