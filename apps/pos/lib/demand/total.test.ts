import { describe, expect, it } from 'vitest';
import { parsePaisa, parseQty, qtyToString } from '@natech/domain';
import { sheetEstimate, unpricedLines, type DemandLineRow } from './total';

/**
 * Demand sheet arithmetic — ADR 0026, docs/runfiles/M23-demand-sheets.md §4.
 *
 * The lifecycle itself is `demandSheetMachine`, tested beside the other three
 * machines in `packages/domain/test/state-machines.test.ts`.
 *
 * Asserted against the specification, not the implementation: the numbers below
 * are what a manager would work out on paper for the same sheet.
 */

const line = (item: string, qty: string, unitCost: string | null): DemandLineRow => ({
  id: item,
  item,
  unit: 'kg',
  category: 'Kitchen',
  qty: parseQty(qty),
  estimatedUnitCost: unitCost === null ? null : parsePaisa(unitCost),
  note: null,
});

describe('quantity round-trip', () => {
  it('survives numeric(10,3) without drift', () => {
    // The column is `numeric(10,3)` and Drizzle hands it back as a string, so
    // this pair is the only conversion in the module. 0.1 is the value that
    // breaks a float column, which is why it is the one tested.
    for (const text of ['20.000', '0.250', '0.100', '1.005', '9999.999']) {
      expect(qtyToString(parseQty(text))).toBe(text);
    }
  });

  it('refuses a fourth decimal rather than silently rounding it', () => {
    expect(() => parseQty('1.2345')).toThrow(TypeError);
  });
});

describe('sheetEstimate', () => {
  it('extends each line and totals them in exact paisa', () => {
    // 20 kg × Rs. 620.00 = Rs. 12,400.00; 0.25 kg × Rs. 8,000.00 = Rs. 2,000.00.
    const lines = [line('chicken', '20', '620.00'), line('saffron', '0.25', '8000.00')];
    expect(sheetEstimate(lines)).toBe(1_440_000n);
  });

  it('rounds a fractional extension once, half away from zero', () => {
    // 0.333 kg × Rs. 10.00 = 333 paisa exactly; the third decimal is where a
    // float would already have drifted.
    expect(sheetEstimate([line('spice', '0.333', '10.00')])).toBe(333n);
  });

  it('omits an unpriced line from the total instead of treating it as free', () => {
    const lines = [line('chicken', '20', '620.00'), line('onions', '50', null)];
    expect(sheetEstimate(lines)).toBe(1_240_000n);
    // R16 — the screen must be able to say the total does not cover everything.
    expect(unpricedLines(lines)).toBe(1);
  });

  it('is zero, not NaN, on a sheet with no prices at all', () => {
    expect(sheetEstimate([line('onions', '50', null)])).toBe(0n);
  });
});
