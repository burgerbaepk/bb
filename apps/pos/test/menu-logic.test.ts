import { describe, expect, it } from 'vitest';
import { parsePaisa } from '@natech/domain';
import {
  findTaxClassId,
  isSamePopulation,
  resequence,
  validateSelectRange,
} from '@/lib/menu/logic';

/**
 * The pure logic behind menu CRUD and drag-reorder — BUILD-PLAN.md §5.3; M08
 * runfile. Nothing here touches a database, a session, or React, so nothing
 * here needs mocking — see `lib/menu/logic.ts`'s own doc comment for why the
 * decisions live apart from the actions that call them.
 */

describe('resequence', () => {
  it('produces contiguous sort_order, in the dropped order, from an arbitrary input order', () => {
    expect(resequence(['c', 'a', 'b'])).toEqual([
      { id: 'c', sortOrder: 0 },
      { id: 'a', sortOrder: 1 },
      { id: 'b', sortOrder: 2 },
    ]);
  });

  it('is contiguous even when the input is already sorted', () => {
    expect(resequence(['x', 'y', 'z'])).toEqual([
      { id: 'x', sortOrder: 0 },
      { id: 'y', sortOrder: 1 },
      { id: 'z', sortOrder: 2 },
    ]);
  });

  it('handles the empty list', () => {
    expect(resequence([])).toEqual([]);
  });

  it('handles a single-item list', () => {
    expect(resequence(['only'])).toEqual([{ id: 'only', sortOrder: 0 }]);
  });
});

describe('isSamePopulation', () => {
  it('accepts a reordering of the same ids', () => {
    expect(isSamePopulation(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(true);
  });

  it('refuses a proposed list missing an id the database still holds', () => {
    expect(isSamePopulation(['a', 'b', 'c'], ['a', 'b'])).toBe(false);
  });

  it('refuses a proposed list inventing an id the database does not hold', () => {
    expect(isSamePopulation(['a', 'b'], ['a', 'b', 'z'])).toBe(false);
  });

  it('refuses an empty proposal against a non-empty population', () => {
    expect(isSamePopulation(['a'], [])).toBe(false);
  });
});

describe('price parsing round-trips through parsePaisa, never through parseFloat (R1)', () => {
  it('parses a whole-rupee amount typed in the item editor to its wire paisa string', () => {
    expect(parsePaisa('530').toString()).toBe('53000');
  });

  it('parses a rupee-and-paisa amount exactly, without float drift', () => {
    expect(parsePaisa('530.07').toString()).toBe('53007');
  });

  it('parses a negative amount, for a variant that discounts the base price', () => {
    expect(parsePaisa('-50.00').toString()).toBe('-5000');
  });

  it('round-trips a value back to the same rupee-decimal text a form would show', () => {
    const wire = parsePaisa('1234.50').toString();
    expect(wire).toBe('123450');
    // The inverse a screen renders with `Money`/`(value / 100n)` — asserted
    // here as plain bigint arithmetic so the test does not need `@natech/ui`.
    const paisaValue = BigInt(wire);
    expect(`${paisaValue / 100n}.${(paisaValue % 100n).toString().padStart(2, '0')}`).toBe(
      '1234.50',
    );
  });

  it('rejects a value that is not a money amount, the same way the action reports it as a form error', () => {
    expect(() => parsePaisa('not a price')).toThrow(TypeError);
  });
});

describe('findTaxClassId', () => {
  const seeded = [
    { key: 'STANDARD_FOOD', id: 'tax-standard' },
    { key: 'EXEMPT', id: 'tax-exempt' },
    { key: 'ZERO', id: 'tax-zero' },
  ];

  it('resolves a seeded key to its row id', () => {
    expect(findTaxClassId(seeded, 'EXEMPT')).toBe('tax-exempt');
  });

  it('rejects an unknown key cleanly, returning null rather than throwing', () => {
    // packages/db/seeds/tax.ts always seeds the three TaxClassKeySchema
    // members, so an empty table only happens if `pnpm db:seed` was never
    // run — exactly the case the action turns into a form error rather than
    // a crash.
    expect(findTaxClassId([], 'STANDARD_FOOD')).toBeNull();
  });
});

describe('validateSelectRange', () => {
  it('accepts an optional group with no minimum', () => {
    expect(validateSelectRange({ minSelect: 0, maxSelect: 3, isRequired: false })).toBeNull();
  });

  it('refuses a minimum greater than the maximum', () => {
    expect(validateSelectRange({ minSelect: 5, maxSelect: 2, isRequired: false })).not.toBeNull();
  });

  it('refuses a required group with a zero minimum — the cashier could skip it', () => {
    expect(validateSelectRange({ minSelect: 0, maxSelect: 1, isRequired: true })).not.toBeNull();
  });

  it('accepts a required group with a minimum of one', () => {
    expect(validateSelectRange({ minSelect: 1, maxSelect: 1, isRequired: true })).toBeNull();
  });
});
