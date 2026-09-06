'use client';

import { Button, Dialog } from '@natech/ui';
import type { TrayOrder } from '@natech/contracts';

/**
 * Confirm voiding a booked order.
 */
export interface VoidOrderDialogProps {
  readonly order: TrayOrder | null;
  readonly pending: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

export function VoidOrderDialog({ order, pending, onClose, onConfirm }: VoidOrderDialogProps) {
  if (order === null) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Void order #${order.orderNo}`}
      description="This voids the whole order, including anything still cooking. It cannot be undone from here."
      className="w-[min(24rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="danger" disabled={pending} onClick={onConfirm}>
            {pending ? 'Voiding…' : 'Void order'}
          </Button>
        </>
      }
    />
  );
}
