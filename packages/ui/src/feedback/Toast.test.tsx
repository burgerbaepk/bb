import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOAST_AUTO_DISMISS_MS, ToastRegion } from './Toast';

afterEach(() => vi.useRealTimers());

describe('ToastRegion', () => {
  it('auto-dismisses successful feedback after two seconds', () => {
    vi.useFakeTimers();
    const dismiss = vi.fn();
    render(
      <ToastRegion
        toasts={[{ id: 'saved', tone: 'success', message: 'Saved.' }]}
        onDismiss={dismiss}
      />,
    );

    act(() => vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS - 1));
    expect(dismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(dismiss).toHaveBeenCalledWith('saved');
  });

  it('keeps errors visible until the operator dismisses them', () => {
    vi.useFakeTimers();
    const dismiss = vi.fn();
    render(
      <ToastRegion
        toasts={[{ id: 'failed', tone: 'error', message: 'Could not save.' }]}
        onDismiss={dismiss}
      />,
    );

    act(() => vi.advanceTimersByTime(10_000));
    expect(dismiss).not.toHaveBeenCalled();
  });
});
