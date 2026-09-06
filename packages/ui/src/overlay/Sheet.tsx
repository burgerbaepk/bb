'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * Side and bottom sheet. BUILD-PLAN.md §9.3, §11.3, §13.4.
 *
 * The floor plan opens a context sheet on tap (§9.3), the storefront opens a
 * cart sheet (§13.4), and the POS opens the payment sheet over the order.
 *
 * Also on native `<dialog>`, so it inherits the focus trap and the Escape
 * handler. The `inline` side resolves against the writing direction rather than
 * the viewport, so a sheet anchored to the trailing edge is on the right in
 * English and on the left in Urdu without a second implementation.
 */
export type SheetSide = 'inline-end' | 'inline-start' | 'bottom';

export interface SheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly description?: string | undefined;
  readonly side?: SheetSide | undefined;
  readonly children?: ReactNode | undefined;
  readonly footer?: ReactNode | undefined;
  readonly className?: string | undefined;
}

const SIDE_STYLES: Record<SheetSide, string> = {
  'inline-end': 'h-dvh w-[min(28rem,100vw)] ms-auto me-0 rounded-none',
  'inline-start': 'h-dvh w-[min(28rem,100vw)] me-auto ms-0 rounded-none',
  bottom: 'mt-auto mb-0 max-h-[85dvh] w-full rounded-t-lg',
};

export function Sheet({
  open,
  onClose,
  title,
  description,
  side = 'inline-end',
  children,
  footer,
  className,
}: SheetProps) {
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
      event.preventDefault();
      onClose();
    };
    node.addEventListener('cancel', handleCancel);
    return () => node.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="sheet-title"
      className={cn(
        'bg-surface text-ink border-border max-h-dvh max-w-none border p-0 shadow-xl',
        'backdrop:bg-overlay',
        SIDE_STYLES[side],
        className,
      )}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="flex h-full flex-col">
        <header className="border-border flex items-start gap-4 border-b px-5 py-4">
          <div className="flex-1 space-y-1">
            <h2 id="sheet-title" className="text-lg font-semibold">
              {title}
            </h2>
            {description !== undefined && <p className="text-ink-muted text-sm">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-muted hover:text-ink shrink-0"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer !== undefined && (
          <footer className="border-border bg-surface-raised flex flex-wrap justify-end gap-2 border-t px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </dialog>
  );
}
