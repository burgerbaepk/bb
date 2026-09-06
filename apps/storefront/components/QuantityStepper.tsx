'use client';

import { Minus, Plus } from 'lucide-react';
import { cn } from '@natech/ui';
import { useTranslations } from 'next-intl';

/**
 * The one quantity control on the storefront — BUILD-PLAN.md §13.2, §14.2.
 *
 * There were two before this, on the menu card and in the cart, and they did
 * not agree: the cart's had a *decrement and a disabled, invisible placeholder
 * where its increment should have been*, so a customer who wanted a third naan
 * had to navigate back to the menu to get one. A single control is how that
 * stops being possible to reintroduce.
 *
 * `label` names the thing being counted, so the two buttons announce as "Add
 * one more, Chicken Karahi" rather than as two bare pluses on a page carrying
 * a dozen of them.
 */
export function QuantityStepper({
  quantity,
  label,
  onIncrement,
  onDecrement,
  className,
}: {
  readonly quantity: number;
  readonly label: string;
  readonly onIncrement: () => void;
  readonly onDecrement: () => void;
  readonly className?: string | undefined;
}) {
  const t = useTranslations();

  return (
    // §14.2 — the whole control is 44px tall on every surface it appears on.
    // This is a phone held one-handed over a table, which is the least accurate
    // pointing there is.
    <div
      className={cn(
        'border-store-line bg-store-canvas flex h-11 items-center rounded-full border shadow-sm',
        className,
      )}
    >
      <button
        type="button"
        onClick={onDecrement}
        aria-label={`${t('cart.decrease')}, ${label}`}
        className={cn(
          'hover:bg-store-sunken inline-flex size-10 items-center justify-center rounded-full transition-colors active:scale-95',
        )}
      >
        <Minus aria-hidden="true" className="size-4" />
      </button>
      <span className="min-w-6 text-center text-sm font-bold tabular-nums">{quantity}</span>
      <button
        type="button"
        onClick={onIncrement}
        aria-label={`${t('cart.increase')}, ${label}`}
        className={cn(
          'text-store-accent hover:bg-store-accent-soft inline-flex size-10 items-center justify-center rounded-full transition-colors active:scale-95',
        )}
      >
        <Plus aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}
