import { describe, expect, it } from 'vitest';

import { auditJson } from '../src/audit';

describe('auditJson', () => {
  it('encodes bigint money values as lossless decimal strings', () => {
    expect(
      auditJson({
        orderDiscount: 40_000n,
        totals: { grandTotal: 642_700n },
        adjustments: [1n, 2n],
      }),
    ).toEqual({
      orderDiscount: '40000',
      totals: { grandTotal: '642700' },
      adjustments: ['1', '2'],
    });
  });

  it('preserves ordinary JSON audit values', () => {
    expect(auditJson({ status: 'PLACED', reason: null, count: 2 })).toEqual({
      status: 'PLACED',
      reason: null,
      count: 2,
    });
  });
});
