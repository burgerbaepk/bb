'use client';

import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '../lib/cn';

/**
 * Toasts. BUILD-PLAN.md §2 R15, §19.
 *
 * Each tone carries its own icon and its own word, so the meaning survives
 * without colour (R15). The region is a live region, so a cashier who is
 * looking at the customer rather than the screen still gets the outcome
 * announced.
 *
 * Deliberately not used for anything a cashier must act on. A failed finalize
 * or a payment-method mismatch is a dialog (§6.5), because a toast can be
 * missed and a fiscal document cannot be issued twice.
 */
export type ToastTone = 'info' | 'success' | 'error';

export interface Toast {
  readonly id: string;
  readonly tone: ToastTone;
  readonly message: string;
}

const TONE_ICON = {
  info: Info,
  success: CircleCheck,
  error: CircleAlert,
} as const;

const TONE_WORD: Record<ToastTone, string> = {
  info: 'Notice',
  success: 'Done',
  error: 'Error',
};

const TONE_STYLES: Record<ToastTone, string> = {
  info: 'border-info bg-info-soft text-info',
  success: 'border-ok bg-ok-soft text-ok',
  error: 'border-danger bg-danger-soft text-danger',
};

/** Successful, non-blocking feedback should clear promptly; errors wait for acknowledgement. */
export const TOAST_AUTO_DISMISS_MS = 2_000;

interface ToastContextValue {
  readonly toasts: readonly Toast[];
  readonly show: (tone: ToastTone, message: string) => void;
  readonly dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (value === null) throw new Error('useToast must be used inside a ToastProvider');
  return value;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((tone: ToastTone, message: string) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((current) => [...current, { id, tone, message }]);
  }, []);

  const value = useMemo(() => ({ toasts, show, dismiss }), [toasts, show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function ToastRegion({
  toasts,
  onDismiss,
}: {
  readonly toasts: readonly Toast[];
  readonly onDismiss: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-inline-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4"
    >
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  readonly toast: Toast;
  readonly onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    if (toast.tone === 'error') return;
    const timer = window.setTimeout(() => onDismiss(toast.id), TOAST_AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.tone, onDismiss]);

  const Icon = TONE_ICON[toast.tone];
  return (
    <div
      className={cn(
        'pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-lg border px-3 py-2 shadow-lg',
        TONE_STYLES[toast.tone],
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="sr-only">{TONE_WORD[toast.tone]}:</span>
      <p className="text-ink flex-1 text-sm">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="text-ink-muted hover:text-ink shrink-0"
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
