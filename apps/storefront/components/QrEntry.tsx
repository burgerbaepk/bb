'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { QrCode, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { QrResolution } from '@natech/contracts';
import { useCart } from './CartProvider';

/**
 * `/t/[token]` — BUILD-PLAN.md §13.1, §13.4.
 *
 * Binding the table to the session is the whole job of this page. Everything
 * downstream depends on it: the order arrives in the POS tray with a table code,
 * the check prints against the right table, and the customer's status page knows
 * where they are sitting.
 */
export function QrEntry({ resolution }: { readonly resolution: QrResolution }) {
  const t = useTranslations();
  const cart = useCart();

  useEffect(() => {
    if (!resolution.isActive) return;
    cart.setTable(resolution.token, resolution.tableCode);
    // Binding runs once per resolved token; `cart` is a new object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolution.token, resolution.isActive, resolution.tableCode]);

  if (!resolution.isActive) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <TriangleAlert aria-hidden="true" className="text-warn mx-auto mb-3 size-8" />
        <p className="text-lg">{t('qr.retired')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-12 text-center">
      <QrCode aria-hidden="true" className="text-ink-subtle mx-auto mb-3 size-8" />
      <p className="text-ink-muted">{t('qr.table')}</p>
      <p className="my-2 text-5xl font-bold tabular-nums">{resolution.tableCode}</p>
      <p className="text-ink-muted mb-6">{resolution.zoneName}</p>

      <Link
        href="/menu"
        className="bg-primary text-primary-ink min-h-touch inline-flex items-center rounded-base px-6 font-medium"
      >
        {t('qr.start')}
      </Link>
    </div>
  );
}
