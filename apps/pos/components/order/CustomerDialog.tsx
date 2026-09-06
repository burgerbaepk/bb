'use client';

import { useState } from 'react';
import { Button, Dialog, TextField } from '@natech/ui';

/**
 * The order's customer — ADR 0016; docs/runfiles/M20-customer-capture.md §2.
 *
 * One dialog for both halves of the request: a bare phone number for a
 * walk-in, or a phone plus a name for a "+"-added repeat customer.
 * `setOrderCustomerAction` resolves either through the same `customers`
 * find-or-create by phone, so this form does not need to know which case it
 * is in — only whether a customer is currently attached, which decides
 * whether "Remove customer" appears.
 *
 * The caller mounts this with `key={String(open)}` (`OrderScreen.tsx`) —
 * `phone`/`name` below are only ever read as `useState` initial values, so
 * reseeding them from the current order on every open needs the fresh
 * component instance a changed `key` forces, not a `setState`-in-effect.
 */
export interface CustomerDialogProps {
  readonly open: boolean;
  readonly customerName: string | null;
  readonly customerPhone: string | null;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onSave: (phone: string, name: string | null) => void;
  readonly onRemove: () => void;
}

export function CustomerDialog({
  open,
  customerName,
  customerPhone,
  pending,
  error,
  onClose,
  onSave,
  onRemove,
}: CustomerDialogProps) {
  const [phone, setPhone] = useState(customerPhone ?? '');
  const [name, setName] = useState(customerName ?? '');

  const trimmedPhone = phone.trim();
  const ready = trimmedPhone.length > 0 && !pending;

  const handleSave = () => {
    if (!ready) return;
    const trimmedName = name.trim();
    onSave(trimmedPhone, trimmedName.length > 0 ? trimmedName : null);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Customer"
      description="Printed on the check and the tax invoice. Leave blank for a plain Walk-in Customer."
      footer={
        <>
          {customerPhone !== null && (
            <Button tone="danger" disabled={pending} onClick={onRemove}>
              Remove customer
            </Button>
          )}
          <Button onClick={onClose}>Cancel</Button>
          <Button tone="primary" disabled={!ready} onClick={handleSave}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField
          label="Phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="03xx-xxxxxxx"
          autoFocus
          required
        />
        <TextField
          label="Name"
          help="Optional — shown as Walk-in Customer when left blank."
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Walk-in Customer"
        />
        {error !== null && (
          <p role="alert" className="text-danger text-sm font-medium">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
