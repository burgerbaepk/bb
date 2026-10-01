'use client';

import { useState } from 'react';
import { Megaphone } from 'lucide-react';
import { Button, Dialog, Money, SegmentedControl, TextField } from '@natech/ui';
import type { Paisa } from '@natech/domain';

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
 *
 * ADR 0038 — "Influencer" is the second choice beside the customer: food
 * given away for marketing. It is not a customer setting but a way to close
 * the order — no invoice, and the menu value booked as an expense under
 * Influencers — so its button says so, with the amount, as Finalize does.
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
  /** Menu value ex tax — what the expense will book. */
  readonly influencerValue: Paisa;
  /** False offline, or when the person at the till lacks `discount.apply`. */
  readonly influencerAllowed: boolean;
  readonly influencerNote: string;
  readonly onInfluencer: (name: string) => void;
}

type Mode = 'CUSTOMER' | 'INFLUENCER';
const MODE_OPTIONS: ReadonlyArray<{ readonly value: Mode; readonly label: string }> = [
  { value: 'CUSTOMER', label: 'Customer' },
  { value: 'INFLUENCER', label: 'Influencer' },
];

export function CustomerDialog({
  open,
  customerName,
  customerPhone,
  pending,
  error,
  onClose,
  onSave,
  onRemove,
  influencerValue,
  influencerAllowed,
  influencerNote,
  onInfluencer,
}: CustomerDialogProps) {
  const [mode, setMode] = useState<Mode>('CUSTOMER');
  const [phone, setPhone] = useState(customerPhone ?? '');
  const [name, setName] = useState(customerName ?? '');
  const [influencer, setInfluencer] = useState('');
  const influencerReady =
    influencerAllowed && influencer.trim().length >= 2 && influencerValue > 0n && !pending;

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
      description={
        mode === 'CUSTOMER'
          ? 'Printed on the tax invoice. Leave blank for a plain Walk-in Customer.'
          : 'Food given to an influencer for marketing. No payment and no tax invoice; it is recorded as an expense under Influencers.'
      }
      footer={
        mode === 'INFLUENCER' ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              tone="primary"
              icon={Megaphone}
              disabled={!influencerReady}
              onClick={() => onInfluencer(influencer.trim())}
            >
              {pending ? (
                'Recording…'
              ) : (
                <>
                  Record influencer meal · <Money value={influencerValue} symbol="Rs." />
                </>
              )}
            </Button>
          </>
        ) : (
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
        )
      }
    >
      <div className="space-y-4">
        <SegmentedControl
          label="Who is this for"
          value={mode}
          onChange={setMode}
          options={MODE_OPTIONS}
        />
        {mode === 'INFLUENCER' ? (
          <>
            <TextField
              label="Influencer name"
              value={influencer}
              onChange={(event) => setInfluencer(event.target.value)}
              placeholder="Name or handle"
              autoFocus
              required
            />
            {!influencerAllowed && (
              <p className="text-warn text-sm font-medium">{influencerNote}</p>
            )}
          </>
        ) : (
          <>
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
          </>
        )}
        {error !== null && (
          <p role="alert" className="text-danger text-sm font-medium">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
