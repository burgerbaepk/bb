import { describe, expect, it } from 'vitest';
import { currentOrderStatus } from '@/lib/orders/status';

describe('legacy order status compatibility', () => {
  it('treats CHECK_PRINTED as its ADR 0019 replacement, SERVED', () => {
    expect(currentOrderStatus('CHECK_PRINTED')).toBe('SERVED');
  });

  it.each(['DRAFT', 'PLACED', 'SERVED', 'FINALIZED', 'VOIDED'] as const)(
    'leaves the current %s state unchanged',
    (status) => {
      expect(currentOrderStatus(status)).toBe(status);
    },
  );
});
