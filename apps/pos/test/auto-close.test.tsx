import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SUCCESS_AUTO_CLOSE_MS, useAutoCloseOnSuccess } from '@/lib/useAutoCloseOnSuccess';

afterEach(() => vi.useRealTimers());

describe('useAutoCloseOnSuccess', () => {
  it('closes two seconds after a successful action', () => {
    vi.useFakeTimers();
    const close = vi.fn();
    renderHook(() => useAutoCloseOnSuccess(close, 'Saved.'));

    act(() => vi.advanceTimersByTime(SUCCESS_AUTO_CLOSE_MS));
    expect(close).toHaveBeenCalledOnce();
  });

  it('does not close for an error-only result', () => {
    vi.useFakeTimers();
    const close = vi.fn();
    renderHook(() => useAutoCloseOnSuccess(close, null));

    act(() => vi.advanceTimersByTime(10_000));
    expect(close).not.toHaveBeenCalled();
  });
});
