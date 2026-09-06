'use client';

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { Money } from '@natech/ui';
import { useTranslations } from 'next-intl';
import { useCart } from './CartProvider';

/**
 * The standing way to the checkout — BUILD-PLAN.md §13.2, §13.4.
 *
 * It lived inside `MenuBrowser`, which meant the item page — the one screen a
 * customer reaches by tapping a dish they want — had an Add button that gave no
 * feedback and no route onward. Adding something there looked like nothing had
 * happened. Shared, every surface that can add to the cart also shows what is
 * in it.
 *
 * Renders nothing on an empty cart, so a caller can mount it unconditionally.
 */
export function CartBar() {
  const t = useTranslations();
  const cart = useCart();
  if (cart.itemCount === 0) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-40 sm:inset-x-auto sm:end-5 sm:bottom-5 sm:w-[24rem]">
      <Link
        href="/checkout"
        className="bg-store-accent flex min-h-16 items-center gap-3 rounded-2xl px-4 text-white shadow-2xl ring-1 ring-white/20 transition-transform duration-200 hover:-translate-y-0.5"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
          <ShoppingBag aria-hidden="true" className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">
            {t('cart.review')} · {t('cart.itemCount', { count: cart.itemCount })}
          </span>
          <span className="block text-xs text-white/75">{t('cart.reviewHelp')}</span>
        </span>
        <span className="shrink-0 text-end">
          <Money value={cart.subtotalExTax} symbol="Rs." emphasis="strong" />
        </span>
      </Link>
    </div>
  );
}

/**
 * The space the bar occupies, so the last row of a list is not sitting under it.
 * A caller that renders `CartBar` renders this too.
 */
export function CartBarSpacer() {
  const cart = useCart();
  return cart.itemCount === 0 ? null : <div aria-hidden="true" className="h-24 sm:h-8" />;
}
