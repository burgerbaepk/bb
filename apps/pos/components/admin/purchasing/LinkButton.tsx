import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

/** A navigation that looks like a secondary button, as `/admin/stock` draws its "Count sheet". */
export function LinkButton({
  href,
  icon: Icon,
  children,
}: {
  readonly href: string;
  readonly icon: LucideIcon;
  readonly children: string;
}) {
  return (
    <Link
      href={href}
      className="border-border bg-surface no-print inline-flex min-h-touch items-center gap-2 rounded-base border px-4 text-sm font-medium"
    >
      <Icon aria-hidden="true" className="size-4" />
      {children}
    </Link>
  );
}
