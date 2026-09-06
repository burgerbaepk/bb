'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Plus, UtensilsCrossed } from 'lucide-react';
import { Money, cn } from '@natech/ui';
import { useTranslations } from 'next-intl';
import type { PublicMenuItem } from '@natech/contracts';
import { usePick } from './i18n';
import { useCart } from './CartProvider';
import { QuantityStepper } from './QuantityStepper';

/**
 * One dish, as a row — BUILD-PLAN.md §13.2, §14.2, §19;
 * docs/runfiles/M22-storefront-layout.md §1.
 *
 * This replaces the square photo card the menu was built from, and the reason
 * is density against legibility rather than taste. A card spent about 350px of
 * height on a photograph and fitted roughly six items in a viewport; a row
 * spends about 120px, fits ten to twelve, and gives the name and the
 * description *more* room, not less, because the width is no longer a fifth of
 * the page. A photograph sells the first item on a menu. It does nothing to
 * help somebody find the fourth.
 *
 * The whole row is a link to the dish, laid under the controls as a stretched
 * overlay, so the tap target for "tell me more" is the row and the tap target
 * for "add it" is the button — never one inside the other.
 */
export function MenuRow({
  item,
  categorySlug,
}: {
  readonly item: PublicMenuItem;
  readonly categorySlug: string;
}) {
  const t = useTranslations();
  const pick = usePick();
  const cart = useCart();

  const variantId = item.variants.find((variant) => variant.isDefault)?.id ?? null;
  const imageUrl =
    item.variants.find((variant) => variant.id === variantId)?.imageUrl ?? item.imageUrl;
  const lineId = `${item.id}:${variantId ?? 'base'}`;
  const cartLine = cart.lines.find((line) => line.lineId === lineId);
  const quantity = cartLine === undefined ? 0 : Number(cartLine.qty / 1000n);
  const name = pick(item.name, item.nameUr);
  const description = pick(item.description ?? '', item.descriptionUr);
  const hasVariants = item.variants.length > 0;

  return (
    <article
      className={cn(
        'group border-store-line bg-store-surface relative flex gap-4 rounded-2xl border p-3 transition-colors sm:p-4',
        item.isAvailable ? 'hover:border-store-accent/60' : 'opacity-60',
      )}
    >
      <Link
        href={`/menu/${categorySlug}/${item.slug}`}
        className="absolute inset-0 z-0 rounded-2xl"
        aria-label={name}
      />

      <div className="min-w-0 flex-1">
        <h3 className="font-display text-sm leading-snug font-bold sm:text-base">{name}</h3>

        <p className="mt-1.5 flex items-baseline gap-1.5">
          {hasVariants && (
            <span className="text-store-muted text-[11px] font-medium">{t('menu.from')}</span>
          )}
          <Money value={item.priceExTax} trimWholeRupees emphasis="strong" />
        </p>

        {description !== '' && (
          <p className="text-store-muted mt-1.5 line-clamp-2 text-xs leading-relaxed sm:text-sm">
            {description}
          </p>
        )}

        {!item.isAvailable && (
          <p className="text-store-muted mt-2 text-xs font-semibold">{t('menu.unavailable')}</p>
        )}
        {quantity > 0 && (
          <p className="text-store-accent mt-2 text-xs font-semibold">
            {t('menu.inCart', { count: quantity })}
          </p>
        )}
      </div>

      {/* The thumbnail sits last in the DOM and is decorative — the row's link
          already carries the dish name, so an alt here would announce it twice. */}
      <div className="relative shrink-0 self-center">
        <div className="store-product-media relative size-24 overflow-hidden rounded-xl sm:size-28">
          {imageUrl === null ? (
            <span className="flex size-full items-center justify-center">
              <UtensilsCrossed aria-hidden="true" className="text-store-accent/35 size-8" />
            </span>
          ) : (
            <Image
              src={imageUrl}
              alt=""
              fill
              sizes="(min-width: 640px) 7rem, 6rem"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          )}
        </div>

        {/* Overlapping the thumbnail's lower edge is what keeps the row at one
            line of controls instead of two, and puts the button where a thumb
            already is. */}
        <div className="absolute -bottom-2 -end-2 z-10">
          {hasVariants && item.isAvailable ? (
            <Link
              href={`/menu/${categorySlug}/${item.slug}`}
              className="bg-store-accent min-h-touch inline-flex items-center rounded-full px-3 text-xs font-bold text-white shadow-md"
              aria-label={`${t('menu.chooseSize')}, ${name}`}
            >
              {t('menu.chooseSize')}
            </Link>
          ) : quantity === 0 ? (
            <button
              type="button"
              disabled={!item.isAvailable}
              onClick={() => cart.add(item, variantId)}
              className="bg-store-accent flex size-11 items-center justify-center rounded-full text-white shadow-md transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
              aria-label={`${t('menu.add')}, ${name}`}
            >
              <Plus aria-hidden="true" className="size-5" />
            </button>
          ) : (
            <QuantityStepper
              className="bg-store-surface rounded-full shadow-md"
              quantity={quantity}
              label={name}
              onIncrement={() => cart.increment(lineId)}
              onDecrement={() => cart.remove(lineId)}
            />
          )}
        </div>
      </div>
    </article>
  );
}
