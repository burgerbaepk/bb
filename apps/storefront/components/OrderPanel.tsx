'use client';

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import { Money } from '@natech/ui';
import { useTranslations } from 'next-intl';
import { usePick } from './i18n';
import { useCart } from './CartProvider';

/**
 * The standing order summary — BUILD-PLAN.md §13.2, §19;
 * docs/runfiles/M22-storefront-layout.md §1, §3.
 *
 * `CartBar` is a floating pill: right on a phone, and on a 1440px desktop it
 * leaves the right third of the page empty while the customer has no standing
 * view of what they have added or what it costs. This fills that space with
 * the one thing worth putting in it.
 *
 * **`lg` and up only.** A sticky right column on a 390px viewport is a modal in
 * disguise; `CartBar` already solves the phone properly and keeps it.
 *
 * §13.2 — the figure is the ex-tax subtotal and is labelled as one. There is no
 * inclusive counterpart here by design: the authoritative tax is computed once,
 * at finalize, after the payment method is known (R9), and a storefront that
 * quotes a tax-inclusive total before then is quoting a number it cannot
 * honour. `Money` is the render boundary (R1).
 */
export function OrderPanel() {
  const t = useTranslations();
  const pick = usePick();
  const cart = useCart();

  return (
    <aside
      aria-label={t('cart.title')}
      className="border-store-line bg-store-surface sticky top-[calc(var(--store-header-h)+4.5rem)] hidden max-h-[calc(100dvh-var(--store-header-h)-6rem)] flex-col overflow-hidden rounded-2xl border lg:flex"
    >
      <div className="border-store-line flex items-center gap-2 border-b px-4 py-3.5">
        <ShoppingBag aria-hidden="true" className="text-store-accent size-4 shrink-0" />
        <h2 className="font-display text-sm font-bold">{t('cart.title')}</h2>
        {cart.itemCount > 0 && (
          <span className="text-store-muted ms-auto text-xs tabular-nums">
            {t('cart.itemCount', { count: cart.itemCount })}
          </span>
        )}
      </div>

      {cart.lines.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <ShoppingBag aria-hidden="true" className="text-store-muted/40 mx-auto mb-3 size-8" />
          <p className="text-sm font-semibold">{t('cart.empty')}</p>
          <p className="text-store-muted mt-1 text-xs">{t('cart.emptyHelp')}</p>
        </div>
      ) : (
        <>
          <ul className="divide-store-line min-h-0 flex-1 divide-y overflow-y-auto">
            {cart.lines.map((line) => (
              <li key={line.lineId} className="flex items-start gap-3 px-4 py-3">
                <span className="bg-store-sunken text-store-ink mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold tabular-nums">
                  {Number(line.qty / 1000n)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {pick(line.name, line.nameUr)}
                  </span>
                  {line.variantLabel !== null && (
                    <span className="text-store-muted block truncate text-xs">
                      {line.variantLabel}
                    </span>
                  )}
                </span>
                <Money
                  value={line.unitPriceExTax * (line.qty / 1000n)}
                  trimWholeRupees
                  className="shrink-0 text-sm"
                />
              </li>
            ))}
          </ul>

          <div className="border-store-line border-t p-4">
            <p className="flex items-baseline justify-between gap-3">
              <span className="text-store-muted text-sm">{t('cart.subtotal')}</span>
              <Money value={cart.subtotalExTax} symbol="Rs." emphasis="strong" />
            </p>
            <p className="text-store-muted mt-1 text-[11px]">{t('cart.taxAtCheckout')}</p>
            <Link
              href="/checkout"
              className="bg-store-accent min-h-touch mt-3 flex w-full items-center justify-center rounded-full text-sm font-bold text-white transition-transform hover:scale-[1.02]"
            >
              {t('cart.checkout')}
            </Link>
          </div>
        </>
      )}
    </aside>
  );
}
