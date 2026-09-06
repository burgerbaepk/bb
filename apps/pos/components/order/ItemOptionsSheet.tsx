'use client';

import { useState } from 'react';
import { Button, Money, Sheet, TextField, cn } from '@natech/ui';
import type { ItemVariant, MenuItem, Modifier } from '@natech/contracts';
import { unitPriceOf } from './cartModel';

/**
 * Variant, modifiers, seat, and note — BUILD-PLAN.md §5.3, §10.1.
 *
 * This sheet is where the §5.3 variant collapse is paid for: one grid tile
 * becomes a choice of Full or Half here, rather than two tiles competing for
 * space in a strip that already overflows.
 *
 * The note field matters more than it looks. §10.1 calls modifiers and notes
 * the highest-value data on an order line and observes that they are absent
 * from the current system entirely (defect V5). A note typed here travels
 * with the line at full size, not as a footnote.
 */
export interface ItemOptionsSheetProps {
  /** Never null. The caller mounts this only when an item has been tapped, and
   * keys it by item id so a different item gets fresh state without an effect. */
  readonly item: MenuItem;
  readonly guestCount: number | null;
  readonly onClose: () => void;
  readonly onAdd: (input: {
    readonly item: MenuItem;
    readonly variant: ItemVariant | null;
    readonly modifiers: readonly Modifier[];
    readonly qty: number;
    readonly note: string | null;
    readonly seatNo: number | null;
  }) => void;
}

export function ItemOptionsSheet({ item, guestCount, onClose, onAdd }: ItemOptionsSheetProps) {
  // Initialised from props rather than reset in an effect. The caller keys this
  // component by item id, so tapping a different tile remounts it with the
  // right defaults instead of cascading a render to correct them.
  const [variantId, setVariantId] = useState<string | null>(
    item.variants.find((variant) => variant.isDefault)?.id ?? null,
  );
  const [modifierIds, setModifierIds] = useState<readonly string[]>([]);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [seatNo, setSeatNo] = useState<number | null>(null);

  const variant = item.variants.find((candidate) => candidate.id === variantId) ?? null;
  const modifiers = item.modifierGroups
    .flatMap((group) => group.modifiers)
    .filter((modifier) => modifierIds.includes(modifier.id));

  const unitPrice = unitPriceOf(item, variant);
  const missingRequired = item.modifierGroups.filter(
    (group) =>
      group.isRequired && !group.modifiers.some((modifier) => modifierIds.includes(modifier.id)),
  );

  const toggleModifier = (group: MenuItem['modifierGroups'][number], modifierId: string) => {
    setModifierIds((current) => {
      if (current.includes(modifierId)) return current.filter((id) => id !== modifierId);
      const inGroup = group.modifiers
        .map((modifier) => modifier.id)
        .filter((id) => current.includes(id));
      // A group with maxSelect 1 replaces rather than accumulates, which is
      // what a cashier expects from Mild / Medium / Extra hot.
      if (inGroup.length >= group.maxSelect) {
        return [...current.filter((id) => !inGroup.includes(id)), modifierId];
      }
      return [...current, modifierId];
    });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={item.name}
      description={item.nameUr ?? undefined}
      side="inline-end"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone="primary"
            disabled={missingRequired.length > 0}
            onClick={() => {
              onAdd({
                item,
                variant,
                modifiers,
                qty,
                note: note.trim() === '' ? null : note.trim(),
                seatNo,
              });
              onClose();
            }}
          >
            Add {qty} · <Money value={unitPrice} symbol="Rs." trimWholeRupees />
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {item.variants.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Size</h3>
            <div className="flex flex-wrap gap-2">
              {item.variants.map((candidate) => (
                <OptionChip
                  key={candidate.id}
                  active={candidate.id === variantId}
                  onClick={() => setVariantId(candidate.id)}
                >
                  {candidate.name}
                  <Money className="ms-2" value={unitPriceOf(item, candidate)} trimWholeRupees />
                </OptionChip>
              ))}
            </div>
          </section>
        )}

        {item.modifierGroups.map((group) => (
          <section key={group.id}>
            <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
              {group.name}
              <span className="text-ink-subtle text-xs font-normal">
                {group.isRequired ? 'Required' : 'Optional'} · choose up to {group.maxSelect}
              </span>
            </h3>
            <div className="flex flex-wrap gap-2">
              {group.modifiers.map((modifier) => (
                <OptionChip
                  key={modifier.id}
                  active={modifierIds.includes(modifier.id)}
                  onClick={() => toggleModifier(group, modifier.id)}
                >
                  {modifier.name}
                  {modifier.priceDelta !== 0n && (
                    <Money className="ms-2" value={modifier.priceDelta} trimWholeRupees />
                  )}
                </OptionChip>
              ))}
            </div>
          </section>
        ))}

        <section>
          <h3 className="mb-2 text-sm font-semibold">Quantity</h3>
          <div className="flex items-center gap-3">
            <Button size="lg" onClick={() => setQty((current) => Math.max(1, current - 1))}>
              −
            </Button>
            <output className="w-12 text-center text-2xl tabular-nums">{qty}</output>
            <Button size="lg" onClick={() => setQty((current) => current + 1)}>
              +
            </Button>
          </div>
        </section>

        {guestCount !== null && guestCount > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Seat</h3>
            <div className="flex flex-wrap gap-2">
              <OptionChip active={seatNo === null} onClick={() => setSeatNo(null)}>
                Shared
              </OptionChip>
              {Array.from({ length: guestCount }, (_, index) => index + 1).map((seat) => (
                <OptionChip key={seat} active={seatNo === seat} onClick={() => setSeatNo(seat)}>
                  {seat}
                </OptionChip>
              ))}
            </div>
          </section>
        )}

        <TextField
          label="Note"
          help="Shown at full size on the order. Allergies, doneness, anything staff need to know."
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="No onion"
        />

        {missingRequired.length > 0 && (
          <p role="alert" className="text-danger text-sm font-medium">
            Choose {missingRequired.map((group) => group.name).join(' and ')} before adding.
          </p>
        )}
      </div>
    </Sheet>
  );
}

function OptionChip({
  active,
  onClick,
  children,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'min-h-touch inline-flex items-center rounded-base border px-3 py-2 text-sm',
        active
          ? 'bg-primary text-primary-ink border-primary'
          : 'bg-surface-raised text-ink border-border hover:border-border-strong',
      )}
    >
      {children}
    </button>
  );
}
