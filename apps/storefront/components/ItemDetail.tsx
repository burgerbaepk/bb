'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { Money, cn } from '@natech/ui';
import { useTranslations } from 'next-intl';
import type { PublicMenuItem } from '@natech/contracts';
import { usePick } from './i18n';
import { useCart } from './CartProvider';
import { CartBar, CartBarSpacer } from './CartBar';
import { QuantityStepper } from './QuantityStepper';

/**
 * One item — BUILD-PLAN.md §13.1, §13.2, §5.3.
 *
 * The variant picker is here rather than on the list, which is the customer-side
 * half of the §5.3 collapse: `Special Mutton Mix Olive` is one entry on the menu
 * and a choice of Full or Half on this page, not two entries competing for the
 * same line.
 *
 * The price beside each variant is ex tax like every other price on the
 * storefront (§13.2).
 *
 * Three things this screen previously got wrong, all of them the same mistake —
 * it was built as a leaf and never told what the rest of the flow does:
 *
 *   - **Adding gave no feedback and no way onward.** The sticky cart bar lived
 *     inside `MenuBrowser`, so tapping Add here looked like nothing happening.
 *     It is `CartBar` now, and every surface that can add to the cart shows it.
 *   - **An item already in the cart offered "Add" again** rather than the count
 *     and a stepper, so the only way to see what you had was to leave.
 *   - **`isAvailable` was never checked.** The list greys a sold-out dish out;
 *     this page would happily add it, and the customer found out at the
 *     counter.
 */
export interface ItemDetailProps {
  readonly item: PublicMenuItem;
}

export function ItemDetail({ item }: ItemDetailProps) {
  const t = useTranslations();
  const pick = usePick();
  const cart = useCart();
  const [variantId, setVariantId] = useState<string | null>(
    item.variants.find((variant) => variant.isDefault)?.id ?? null,
  );

  const variant = item.variants.find((candidate) => candidate.id === variantId) ?? null;
  const imageUrl = variant?.imageUrl ?? item.imageUrl;
  const price = variant?.priceExTax ?? item.priceExTax;
  const itemName = pick(item.name, item.nameUr);

  // The same key `CartProvider.add` mints, so the count below is the count of
  // the variant actually selected rather than of the item in the abstract.
  const lineId = `${item.id}:${variant?.id ?? 'base'}`;
  const cartLine = cart.lines.find((line) => line.lineId === lineId);
  const quantity = cartLine === undefined ? 0 : Number(cartLine.qty / 1000n);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Link
        href="/menu"
        className="text-store-muted hover:text-store-ink mb-4 inline-flex min-h-touch items-center gap-1.5 text-sm"
      >
        <ArrowLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
        {t('common.back')}
      </Link>

      {/* §13.5 — served through `next/image` against R2's public URL, AVIF/WebP at explicit dimensions. */}
      {imageUrl !== null && (
        <Image
          src={imageUrl}
          alt={itemName}
          width={640}
          height={480}
          className="border-store-line mb-4 w-full rounded-2xl border object-cover"
          priority
        />
      )}

      <h1 className="font-display text-3xl font-bold">{itemName}</h1>

      {(item.description !== null || item.descriptionUr !== null) && (
        <p className="text-store-muted mt-2">{pick(item.description ?? '', item.descriptionUr)}</p>
      )}

      {item.variants.length > 0 && (
        <div className="mt-6">
          {/* Previously the category slug with one hyphen replaced, so this
              heading read "main course-items" over a Full/Half choice. */}
          <h2 id="variant-label" className="mb-2 text-sm font-semibold">
            {t('menu.chooseOption')}
          </h2>
          <div role="group" aria-labelledby="variant-label" className="flex flex-wrap gap-2">
            {item.variants.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                aria-pressed={candidate.id === variantId}
                onClick={() => setVariantId(candidate.id)}
                className={cn(
                  'min-h-touch rounded-full border px-4 text-sm font-medium transition-colors',
                  candidate.id === variantId
                    ? 'bg-store-accent border-store-accent text-white'
                    : 'bg-store-surface border-store-line hover:border-store-accent',
                )}
              >
                {pick(candidate.name, candidate.nameUr)}
                <Money className="ms-2" value={candidate.priceExTax} trimWholeRupees />
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="mt-6 text-3xl">
        <Money value={price} symbol="Rs." emphasis="strong" />
      </p>

      {!item.isAvailable ? (
        <p className="border-store-line bg-store-sunken text-store-muted mt-4 rounded-2xl border p-4 text-sm font-medium">
          {t('menu.unavailable')}
        </p>
      ) : quantity === 0 ? (
        <button
          type="button"
          onClick={() => cart.add(item, variantId)}
          className="bg-store-accent min-h-touch mt-4 inline-flex items-center gap-2 rounded-full px-6 font-bold text-white shadow-md transition-transform active:scale-95"
        >
          <Plus aria-hidden="true" className="size-4" />
          {t('menu.add')}
        </button>
      ) : (
        <div className="mt-4 flex items-center gap-3">
          <QuantityStepper
            quantity={quantity}
            label={itemName}
            onIncrement={() => cart.increment(lineId)}
            onDecrement={() => cart.remove(lineId)}
          />
          <span className="text-store-muted text-sm">{t('menu.inCart', { count: quantity })}</span>
        </div>
      )}

      <CartBarSpacer />
      <CartBar />
    </div>
  );
}
