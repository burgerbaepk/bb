import { describe, expect, it } from 'vitest';
import { formatDataset } from './helpers';
import {
  MOCK_DECLINED_THEN_CASH_INVOICE,
  MOCK_MENU,
  MOCK_ORDERS,
  MOCK_REFERENCE_INVOICE,
  MOCK_REFERENCE_ORDER,
  MOCK_TABLES,
  orderSubtotal,
  tableChips,
} from '../mocks';
import { MOCK_OUTLET, MOCK_VIEWER_CASHIER, MOCK_VIEWER_WAITER } from '../mocks/outlet';
import { OutletConfigSchema } from '../src/outlet';

/**
 * The Phase 1 dataset has to reproduce Appendix A — BUILD-PLAN.md §18, §19.
 *
 * Every screen in M04, M05, and M06 prices through `@natech/domain` against
 * these orders. If the dataset drifts from the reference invoice, every screen
 * drifts with it and the UI review signs off on the wrong arithmetic.
 */
describe('the reference order reproduces Appendix A.1', () => {
  it('subtotals to 12,220.00 ex tax', () => {
    expect(formatDataset(orderSubtotal(MOCK_REFERENCE_ORDER))).toBe('12,220.00');
  });

  it('finalizes to 13,809.60 on card, with one tax line at 800 bps', () => {
    expect(formatDataset(MOCK_REFERENCE_INVOICE.grandTotal)).toBe('13,809.60');
    expect(formatDataset(MOCK_REFERENCE_INVOICE.taxTotal)).toBe('977.60');
    expect(formatDataset(MOCK_REFERENCE_INVOICE.posFee)).toBe('1.00');
    expect(formatDataset(MOCK_REFERENCE_INVOICE.serviceCharge)).toBe('611.00');
    expect(MOCK_REFERENCE_INVOICE.taxLines).toHaveLength(1);
    expect(MOCK_REFERENCE_INVOICE.taxLines[0]?.rateBps).toBe(800);
    expect(MOCK_REFERENCE_INVOICE.taxLines[0]?.paymentMethodScope).toBe('CARD');
  });

  it('re-rates to 14,787.20 when the card declines and cash is taken — A.3', () => {
    expect(formatDataset(MOCK_DECLINED_THEN_CASH_INVOICE.grandTotal)).toBe('14,787.20');
    expect(MOCK_DECLINED_THEN_CASH_INVOICE.taxLines[0]?.rateBps).toBe(1600);

    const attempts = MOCK_DECLINED_THEN_CASH_INVOICE.payments.map(
      (payment) => `${payment.method}:${payment.attemptStatus}`,
    );
    expect(attempts).toEqual(['CARD:DECLINED', 'CASH:APPROVED']);
  });
});

describe('the dataset is complete enough to render every Phase 1 surface', () => {
  it('collapses the §5.3 variant items into one tile each', () => {
    const collapsed = MOCK_MENU.items.filter((item) => item.variants.length > 0);
    expect(collapsed.map((item) => item.name)).toContain('Special Mutton Mix Olive');
    for (const item of collapsed) {
      expect(item.variants.filter((variant) => variant.isDefault)).toHaveLength(1);
    }
  });

  it('covers every §9.1 table state on the floor', () => {
    const states = new Set(MOCK_TABLES.map((table) => table.status));
    expect([...states].sort()).toEqual([
      'BLOCKED',
      'CLEANING',
      'FREE',
      'ORDERED',
      'PAYING',
      'RESERVED',
      'SEATED',
      'SERVED',
    ]);
  });

  it('omits the money row on a table chip for a waiter — §9.2', () => {
    const cashierChips = tableChips(MOCK_VIEWER_CASHIER);
    const waiterChips = tableChips(MOCK_VIEWER_WAITER);

    expect(cashierChips.some((chip) => chip.money !== null)).toBe(true);
    expect(waiterChips.every((chip) => chip.money === null)).toBe(true);
  });

  it('keeps every order free of a tax field — R9', () => {
    for (const order of MOCK_ORDERS) {
      const keys = Object.keys(order).join(' ').toLowerCase();
      expect(keys).not.toContain('tax');
      for (const line of order.lines) {
        const lineKeys = Object.keys(line)
          .filter((key) => key !== 'taxClass')
          .join(' ')
          .toLowerCase();
        expect(lineKeys).not.toContain('tax');
      }
    }
  });
});

describe('outlet configuration', () => {
  it('accepts database-null optional contact and registration fields', () => {
    expect(
      OutletConfigSchema.safeParse({
        ...MOCK_OUTLET,
        email: null,
      }).success,
    ).toBe(true);
  });
});
