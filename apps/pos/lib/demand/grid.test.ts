import { describe, expect, it } from 'vitest';
import { parseQty } from '@natech/domain';
import { collectGridLines, type GridEntry } from './grid';

/**
 * Grid entry — M24, docs/runfiles/M24-demand-catalogue.md §4.
 *
 * Asserted against the paper form's behaviour: a box left blank asks for
 * nothing, and a box with a number in it asks for that much.
 */

const entry = (name: string, raw: string, unit: string | null = null): GridEntry => ({
  itemId: name,
  name,
  category: 'Kitchen',
  defaultUnit: unit,
  raw,
});

describe('collectGridLines', () => {
  it('keeps only the boxes that were filled in', () => {
    const result = collectGridLines([
      entry('Chicken', '20'),
      entry('Mozzarella', ''),
      entry('Jalapeno', '   '),
      entry('Fries', '5'),
    ]);
    expect(result.lines.map((line) => line.item)).toEqual(['Chicken', 'Fries']);
    expect(result.errors).toEqual([]);
  });

  it('treats a typed zero the same as an empty box', () => {
    // "0" and blank both mean "not this week". A sheet of 144 zeroes would
    // bury the twenty lines that matter.
    expect(collectGridLines([entry('Chicken', '0')]).lines).toEqual([]);
  });

  it('carries the fractional quantity through exactly', () => {
    const result = collectGridLines([entry('Saffron', '0.25')]);
    expect(result.lines[0]?.qty).toBe(parseQty('0.25'));
  });

  it('takes the unit from the catalogue when it has one', () => {
    const result = collectGridLines([entry('Chicken', '20', 'kg'), entry('Straws', '3')]);
    expect(result.lines[0]?.unit).toBe('kg');
    // Null, not an invented default — the paper form has no unit column.
    expect(result.lines[1]?.unit).toBeNull();
  });

  it('fails one bad box by name and keeps the rest', () => {
    const result = collectGridLines([
      entry('Chicken', '20'),
      entry('Tomato', 'two crates'),
      entry('Fries', '5'),
    ]);
    expect(result.errors).toEqual(['Tomato: "two crates" is not a quantity.']);
    expect(result.lines.map((line) => line.item)).toEqual(['Chicken', 'Fries']);
  });

  it('rejects a negative quantity rather than ordering backwards', () => {
    const result = collectGridLines([entry('Chicken', '-5')]);
    expect(result.lines).toEqual([]);
    expect(result.errors).toEqual(['Chicken: a quantity cannot be negative.']);
  });

  it('rejects a fourth decimal, as the column cannot hold one', () => {
    expect(collectGridLines([entry('Spice', '1.2345')]).errors).toHaveLength(1);
  });
});
