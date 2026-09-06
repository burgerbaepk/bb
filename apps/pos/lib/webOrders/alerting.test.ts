import { describe, expect, it } from 'vitest';
import { alertingOrders, pruneAcknowledged } from './alerting';

/**
 * §13.4 — asserted against the rule, not the implementation. Every case here
 * is a way a real alarm goes wrong in service.
 */
const a = { orderId: 'a' };
const b = { orderId: 'b' };

describe('alertingOrders', () => {
  it('rings for a pending order nobody has silenced', () => {
    expect(alertingOrders([a], [])).toEqual([a]);
  });

  it('stops once the order on screen is silenced', () => {
    expect(alertingOrders([a], ['a'])).toEqual([]);
  });

  it('rings again for an order that lands after the silence', () => {
    // The failure this prevents: a global "silenced" flag mutes the second
    // order of the night, and staff never learn it arrived.
    expect(alertingOrders([a, b], ['a'])).toEqual([b]);
  });

  it('is silent when nothing is pending', () => {
    expect(alertingOrders([], ['a'])).toEqual([]);
  });
});

describe('pruneAcknowledged', () => {
  it('forgets an order once it has been accepted or rejected', () => {
    expect(pruneAcknowledged([b], ['a', 'b'])).toEqual(['b']);
  });

  it('does not resurrect the alarm for an order that is still silenced', () => {
    const acknowledged = pruneAcknowledged([a, b], ['a']);
    expect(alertingOrders([a, b], acknowledged)).toEqual([b]);
  });

  it('empties itself when the inbox is cleared', () => {
    expect(pruneAcknowledged([], ['a', 'b'])).toEqual([]);
  });
});
