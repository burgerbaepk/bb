import type { Metadata } from 'next';

/**
 * The unauthenticated shell — BUILD-PLAN.md §14.2.
 *
 * No POS chrome: there is no bound terminal yet, so an offline banner, an
 * active-orders badge, and a staff name would all be describing a session that
 * does not exist.
 */
export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface text-ink flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
