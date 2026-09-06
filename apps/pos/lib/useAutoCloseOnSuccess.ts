'use client';

import { useEffect } from 'react';

export const SUCCESS_AUTO_CLOSE_MS = 2_000;

/** Close an action sheet shortly after its primary entity was changed successfully. */
export function useAutoCloseOnSuccess(
  onClose: () => void,
  primary: string | null,
  secondary: string | null = null,
  tertiary: string | null = null,
): void {
  const succeeded = primary !== null || secondary !== null || tertiary !== null;

  useEffect(() => {
    if (!succeeded) return;
    const timer = window.setTimeout(onClose, SUCCESS_AUTO_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [succeeded, onClose]);
}
