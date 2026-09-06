import type { Locale } from '@natech/contracts';

/**
 * The framework-free half of locale resolution — BUILD-PLAN.md §15.1.
 *
 * Split out of `request.ts` on purpose: that file imports `next/headers`
 * (`cookies()`), a server-only API, and `components/i18n.tsx` — a Client
 * Component — only needs the cookie's *name*, to write it back on toggle.
 * Importing anything from `request.ts` would pull `next/headers` into the
 * client bundle and fail the build (Next.js's own "Server Component API used
 * outside the App Router's server tree" check).
 */
export const LOCALE_COOKIE = 'NEXT_LOCALE';

/** An unrecognised or absent cookie value is English, never a throw. */
export function resolveLocale(raw: string | undefined): Locale {
  return raw === 'ur' ? 'ur' : 'en';
}
