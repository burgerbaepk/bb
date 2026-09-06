import { describe, expect, it, vi } from 'vitest';
import { isOrderNoConflict, nextOrderNoFrom, withOrderNoRetry } from '../src/orderNoLogic';

/**
 * `order_no` allocation — BUILD-PLAN.md §5.6; this file's own doc comment
 * explains the MAX+1-with-retry-once design chosen in place of a locked
 * counter row. The arithmetic and the retry decision are both pure enough to
 * test directly; the `MAX(order_no)` read itself needs a live database and is
 * exercised only by code review and the manual dev-server pass (M09a runfile).
 */
describe('nextOrderNoFrom', () => {
  it('starts at 1 for the first order of a business date', () => {
    expect(nextOrderNoFrom(null)).toBe(1);
  });

  it('is one past the current maximum', () => {
    expect(nextOrderNoFrom(41)).toBe(42);
  });
});

describe('isOrderNoConflict', () => {
  it('recognises the partial-unique index violation by name', () => {
    const error = new Error('insert failed', {
      cause: new Error(
        'duplicate key value violates unique constraint "orders_business_date_no_idx"',
      ),
    });
    expect(isOrderNoConflict(error)).toBe(true);
  });

  it('is false for an unrelated constraint', () => {
    const error = new Error('insert failed', {
      cause: new Error('duplicate key value violates unique constraint "orders_client_uuid_idx"'),
    });
    expect(isOrderNoConflict(error)).toBe(false);
  });

  it('is false when there is no cause at all', () => {
    expect(isOrderNoConflict(new Error('something else went wrong'))).toBe(false);
  });
});

describe('withOrderNoRetry', () => {
  it('returns the result on a clean first attempt without retrying', async () => {
    const attempt = vi.fn().mockResolvedValue('ok');
    await expect(withOrderNoRetry(attempt)).resolves.toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('retries exactly once after an order-number collision, and succeeds', async () => {
    const conflict = new Error('insert failed', {
      cause: new Error('violates unique constraint "orders_business_date_no_idx"'),
    });
    const attempt = vi.fn().mockRejectedValueOnce(conflict).mockResolvedValueOnce('ok on retry');
    await expect(withOrderNoRetry(attempt)).resolves.toBe('ok on retry');
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('does not retry, and rethrows, for any other error', async () => {
    const other = new Error('some unrelated failure');
    const attempt = vi.fn().mockRejectedValue(other);
    await expect(withOrderNoRetry(attempt)).rejects.toBe(other);
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('propagates a second failure after one retry rather than looping forever', async () => {
    const conflict = new Error('insert failed', {
      cause: new Error('violates unique constraint "orders_business_date_no_idx"'),
    });
    const attempt = vi.fn().mockRejectedValue(conflict);
    await expect(withOrderNoRetry(attempt)).rejects.toBe(conflict);
    expect(attempt).toHaveBeenCalledTimes(2);
  });
});
