import { describe, expect, it } from 'vitest';
import { parsePaisa, parseQty } from '@natech/domain';
import { demandSheetEmail } from './email';

const line = (over: Partial<Parameters<typeof demandSheetEmail>[0]['lines'][number]> = {}) => ({
  id: 'l1',
  item: 'Onions',
  unit: 'kg',
  category: 'Vegetables',
  qty: parseQty('20'),
  estimatedUnitCost: parsePaisa('100.00'),
  note: null,
  ...over,
});

describe('demandSheetEmail — ADR 0026', () => {
  it('states the estimate and counts the lines it could not price', () => {
    const { subject, text } = demandSheetEmail({
      neededBy: '2026-09-08',
      supplier: 'Sabzi Mandi',
      note: 'Morning delivery',
      createdBy: 'Ayesha',
      submittedAt: new Date('2026-09-06T09:00:00.000Z'),
      lines: [line(), line({ id: 'l2', item: 'Tomatoes', estimatedUnitCost: null })],
    });

    expect(subject).toBe('Demand sheet — needed by 2026-09-08');
    expect(text).toContain('Onions — 20 kg (Vegetables) est. Rs. 100.00/unit');
    // 20 x 100.00, with the unpriced line excluded rather than treated as free.
    expect(text).toContain(
      'Estimated cost: Rs. 2,000.00 — excludes 1 line with no estimated price',
    );
    expect(text).toContain('Requested (2 lines):');
  });

  it('omits the exclusion note when every line carries a price', () => {
    const { text } = demandSheetEmail({
      neededBy: '2026-09-08',
      supplier: null,
      note: null,
      createdBy: null,
      submittedAt: null,
      lines: [line()],
    });
    expect(text).toContain('Estimated cost: Rs. 2,000.00\n');
    expect(text).toContain('Supplier: not named');
  });
});
