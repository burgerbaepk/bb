import { describe, expect, it } from 'vitest';
import { canUseAssistant } from './access';
import { toModelJson } from './serialise';

describe('toModelJson — R1 at the model boundary', () => {
  it('renders paisa as rupees and qty as thousandths', () => {
    expect(
      JSON.parse(toModelJson({ netSales: 125050n, refund: -5n, qtySold: 2500n, covers: 4 })),
    ).toEqual({ netSales: '1250.50', refund: '-0.05', qtySold: '2.500', covers: 4 });
  });

  it('reaches bigints nested in arrays', () => {
    expect(toModelJson([{ amount: 100n }])).toBe('[{"amount":"1.00"}]');
  });
});

describe('canUseAssistant — ADR 0031', () => {
  it('is the owner and the manager, and nobody else', () => {
    expect(
      (['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'AUDITOR'] as const).filter(canUseAssistant),
    ).toEqual(['OWNER', 'MANAGER']);
  });
});
