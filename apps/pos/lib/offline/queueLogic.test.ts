import { describe, expect, it } from 'vitest';
import { OfflineStateSchema } from '@natech/contracts';
import { computeOfflineState } from './queueLogic';

describe('computeOfflineState — §8', () => {
  it('reports online with no blocked actions and no queue', () => {
    const state = computeOfflineState({ online: true, queuedOrders: 0, lastSyncAt: new Date() });
    expect(OfflineStateSchema.parse(state)).toEqual(state);
    expect(state.online).toBe(true);
    expect(state.blockedActions).toEqual([]);
  });

  it('blocks refunds, shift close, and supervisor discounts unconditionally offline', () => {
    const state = computeOfflineState({ online: false, queuedOrders: 1, lastSyncAt: new Date() });
    expect(state.blockedActions).toEqual(['REFUND', 'SHIFT_CLOSE', 'SUPERVISOR_DISCOUNT']);
  });

  it('blocks even with a tiny queue and a moment offline — not tied to the 200/6h escalation', () => {
    const state = computeOfflineState({ online: false, queuedOrders: 1, lastSyncAt: new Date() });
    expect(state.blockedActions.length).toBeGreaterThan(0);
  });

  it('reports real seconds since the last successful sync', () => {
    const lastSyncAt = new Date('2026-08-26T10:00:00Z');
    const now = new Date('2026-08-26T10:07:05Z');
    const state = computeOfflineState({ online: false, queuedOrders: 5, lastSyncAt, now });
    expect(state.secondsSinceLastSync).toBe(425);
    expect(state.queuedOrders).toBe(5);
  });

  it('never reports negative seconds even if the clock reads oddly', () => {
    const now = new Date('2026-08-26T10:00:00Z');
    const lastSyncAt = new Date('2026-08-26T10:05:00Z');
    const state = computeOfflineState({ online: false, queuedOrders: 0, lastSyncAt, now });
    expect(state.secondsSinceLastSync).toBe(0);
  });
});
