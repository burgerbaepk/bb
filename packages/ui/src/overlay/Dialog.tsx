'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * Modal dialog. BUILD-PLAN.md §6.5, §11.3, §19.
 *
 * Built on the native `<dialog>` element, which brings the focus trap, the
 * Escape handler, inert background, and the top layer without a headless UI
 * dependency and without a `z-index` argument.
 *
 * This is the component behind the §6.5 payment-method mismatch confirmation
 * and behind every destructive confirmation in §11.3. Those must be dialogs
 * rather than toasts: they gate an action that issues a fiscal document, and a
 * cashier who misses a toast has still finalized the invoice.
 */
export interface DialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description?: string | undefined;
  readonly children?: ReactNode | undefined;
  /** Primary action last, per §11.3: never adjacent to a destructive one. */
  readonly footer?: ReactNode | undefined;
  /** Escape and backdrop clicks are ignored. For a decision that must be made. */
  readonly mandatory?: boolean | undefined;
  readonly className?: string | undefined;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  mandatory = false,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (node === null) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  useEffect(() => {
    const node = ref.current;
    if (node === null) return undefined;

    const handleCancel = (event: Event) => {
      // `cancel` fires on Escape. A mandatory dialog swallows it.
      if (mandatory) {
        event.preventDefault();
        return;
      }
      event.preventDefault();
      onClose();
    };

    node.addEventListener('cancel', handleCancel);
    return () => node.removeEventListener('cancel', handleCancel);
  }, [mandatory, onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      className={cn(
        'bg-surface text-ink border-border m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border p-0 shadow-xl',
        'backdrop:bg-overlay',
        className,
      )}
      onClick={
        mandatory
          ? undefined
          : (event) => {
              // A click landing on the dialog element itself is the backdrop;
              // anything inside the content div stops here first.
              if (event.target === ref.current) onClose();
            }
      }
    >
      <div className="flex flex-col">
        <header className="border-border flex items-start gap-4 border-b px-5 py-4">
          <div className="flex-1 space-y-1">
            <h2 id="dialog-title" className="text-lg font-semibold">
              {title}
            </h2>
            {description !== undefined && <p className="text-ink-muted text-sm">{description}</p>}
          </div>
          {!mandatory && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="text-ink-muted hover:text-ink shrink-0"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          )}
        </header>

        {children !== undefined && <div className="px-5 py-4">{children}</div>}

        {footer !== undefined && (
          <footer className="border-border bg-surface-raised flex flex-wrap justify-end gap-2 border-t px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
}
