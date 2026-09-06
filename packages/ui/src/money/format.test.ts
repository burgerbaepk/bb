import { describe, expect, it } from 'vitest';
import { formatPaisa } from './format';

/**
 * M01 gate G4 — `Money` must reproduce the Appendix A.1 figures exactly.
 *
 * Appendix A.1 is a golden fixture: any change to the output here is a
 * breaking change. These are the figures a customer reads on the printed
 * invoice, so a discrepancy of one paisa between screen and paper is a
 * discrepancy a PRA officer can see.
 */
describe('formatPaisa — Appendix A.1', () => {
  it('renders the reference invoice line totals', () => {
    expect(formatPaisa(212000n)).toBe('2,120.00'); // 4 x 530.00
    expect(formatPaisa(198000n)).toBe('1,980.00'); // 3 x 660.00
    expect(formatPaisa(417000n)).toBe('4,170.00'); // 3 x 1,390.00
    expect(formatPaisa(302000n)).toBe('3,020.00'); // 1 x 3,020.00
    expect(formatPaisa(24000n)).toBe('240.00'); // 3 x 80.00
    expect(formatPaisa(16000n)).toBe('160.00'); // 1 x 160.00
  });

  it('renders the reference invoice totals', () => {
    expect(formatPaisa(1222000n)).toBe('12,220.00'); // total ex tax
    expect(formatPaisa(97760n)).toBe('977.60'); // sales tax at 8 percent
    expect(formatPaisa(100n)).toBe('1.00'); // POS service fee
    expect(formatPaisa(61100n)).toBe('611.00'); // service charge at 5 percent
    expect(formatPaisa(1380960n)).toBe('13,809.60'); // grand total
  });

  it('renders the Appendix A.2 both-rates check totals', () => {
    expect(formatPaisa(97760n)).toBe('977.60'); // card, 8 percent
    expect(formatPaisa(1380960n)).toBe('13,809.60');
    expect(formatPaisa(195520n)).toBe('1,955.20'); // cash, 16 percent
    expect(formatPaisa(1478720n)).toBe('14,787.20');
  });

  it('prefixes the currency symbol when asked', () => {
    expect(formatPaisa(1380960n, { symbol: 'Rs.' })).toBe('Rs. 13,809.60');
  });
});

describe('formatPaisa — edges', () => {
  it('renders zero with both decimal places', () => {
    expect(formatPaisa(0n)).toBe('0.00');
  });

  it('renders a single paisa', () => {
    expect(formatPaisa(1n)).toBe('0.01');
  });

  it('pads a single-digit paisa remainder', () => {
    expect(formatPaisa(105n)).toBe('1.05');
  });

  it('groups at every thousand boundary', () => {
    expect(formatPaisa(100000n)).toBe('1,000.00');
    expect(formatPaisa(99999n)).toBe('999.99');
    expect(formatPaisa(100000000n)).toBe('1,000,000.00');
    expect(formatPaisa(123456789012n)).toBe('1,234,567,890.12');
  });

  it('renders a negative with a leading sign', () => {
    expect(formatPaisa(-1380960n)).toBe('-13,809.60');
    expect(formatPaisa(-1n)).toBe('-0.01');
  });

  it('parenthesises a negative for credit-note context', () => {
    expect(formatPaisa(-1380960n, { parenthesiseNegative: true })).toBe('(13,809.60)');
    expect(formatPaisa(-1380960n, { symbol: 'Rs.', parenthesiseNegative: true })).toBe(
      '(Rs. 13,809.60)',
    );
  });

  it('trims decimals only when asked and only on whole rupees', () => {
    expect(formatPaisa(61100n, { trimWholeRupees: true })).toBe('611');
    expect(formatPaisa(1380960n, { trimWholeRupees: true })).toBe('13,809.60');
  });

  it('survives a value far beyond Number.MAX_SAFE_INTEGER', () => {
    // The point of bigint: this is exact, where a float would have rounded.
    expect(formatPaisa(9007199254740993n)).toBe('90,071,992,547,409.93');
  });
});
