'use client';

import { Button, Dialog } from '@natech/ui';

/**
 * Confirmation prompt for destructive booked-order changes.
 */
export interface PinConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

export function PinConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pending,
  error,
  onClose,
  onConfirm,
}: PinConfirmDialogProps) {
  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      className="w-[min(24rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="danger" disabled={pending} onClick={onConfirm}>
            {pending ? 'Checking…' : confirmLabel}
          </Button>
        </>
      }
    >
      {error !== null && (
        <p role="alert" className="text-danger text-sm font-medium">
          {error}
        </p>
      )}
    </Dialog>
  );
}
