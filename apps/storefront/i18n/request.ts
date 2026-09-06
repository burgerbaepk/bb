import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import type { Locale } from '@natech/contracts';
import en from '../messages/en.json';
import ur from '../messages/ur.json';
import { LOCALE_COOKIE, resolveLocale } from './locale';

/**
 * Locale resolution, without routing — BUILD-PLAN.md §15.1; docs/runfiles/M15-urdu.md §3.
 *
 * No `[locale]` route segment, no `middleware.ts`: the customer's locale is
 * a cookie, read here on every request, so `<html lang dir>` (`app/layout.tsx`)
 * and every server-rendered string are correct on first paint — the gap the
 * old `LocaleProvider`'s client-only `useEffect` flip left. Every canonical
 * URL, the sitemap, and the JSON-LD M14 built stay untouched.
 */
const MESSAGES: Readonly<Record<Locale, typeof en>> = { en, ur };

export default getRequestConfig(async () => {
  const store = await cookies();
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value);
  return { locale, messages: MESSAGES[locale] };
});
