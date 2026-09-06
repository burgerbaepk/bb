'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import type { Locale } from '@natech/contracts';
import { LOCALE_COOKIE } from '@/i18n/locale';

/**
 * The DB-field bilingual selector, and the locale switch — BUILD-PLAN.md
 * §15.1, §15.2; docs/runfiles/M15-urdu.md §2/§3.
 *
 * `next-intl` (`useTranslations`, `NextIntlClientProvider`) covers every
 * *translated UI string* — this file covers the other half, `name`/`nameUr`
 * pairs read straight off a menu row, which `next-intl` has no concept of.
 * Kept as its own hook rather than folded into a `useTranslations()` call
 * because it takes two strings and picks one, not a message key.
 */
export function usePick(): (english: string, urdu: string | null) => string {
  const locale = useLocale();
  return (english, urdu) => (locale === 'ur' && urdu !== null && urdu !== '' ? urdu : english);
}

/**
 * No `[locale]` route segment exists (§3 of the runfile), so "switch
 * language" is a cookie write plus `router.refresh()` — the request-scoped
 * `getRequestConfig` (`i18n/request.ts`) picks the new value up on the very
 * next render, server-rendered `<html lang dir>` included.
 */
export function useLocaleSwitch(): { readonly locale: Locale; readonly toggle: () => void } {
  const locale = useLocale() as Locale;
  const router = useRouter();

  const toggle = useCallback(() => {
    const next: Locale = locale === 'ur' ? 'en' : 'ur';
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [locale, router]);

  return { locale, toggle };
}
