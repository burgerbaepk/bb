import Link from 'next/link';
import { Globe, Building2, Palette, Printer, ReceiptText, SlidersHorizontal } from 'lucide-react';
import { cn } from '@natech/ui';

export type SettingsSection = 'outlet' | 'pos' | 'receipt' | 'branding' | 'printing' | 'seo';

const ITEMS = [
  { value: 'outlet', label: 'Outlet', icon: Building2 },
  { value: 'pos', label: 'POS rules', icon: SlidersHorizontal },
  { value: 'receipt', label: 'Receipt & invoice', icon: ReceiptText },
  { value: 'branding', label: 'Branding', icon: Palette },
  { value: 'seo', label: 'Storefront SEO', icon: Globe },
  { value: 'printing', label: 'Printing', icon: Printer },
] as const;

export function SettingsNav({
  active,
  canManage,
}: {
  readonly active: SettingsSection;
  readonly canManage: boolean;
}) {
  const visible = ITEMS.filter((item) => {
    if (item.value === 'pos') return true;
    return canManage;
  });

  return (
    <nav
      aria-label="Settings sections"
      className="border-border bg-surface-raised mb-6 overflow-x-auto rounded-base border p-1.5"
    >
      <ul className="flex min-w-max gap-1">
        {visible.map((item) => {
          const Icon = item.icon;
          const selected = item.value === active;
          return (
            <li key={item.value}>
              <Link
                href={`/admin/settings?section=${item.value}`}
                aria-current={selected ? 'page' : undefined}
                className={cn(
                  'min-h-touch flex items-center gap-2 rounded-base px-3 py-2 text-sm font-medium',
                  selected
                    ? 'bg-primary text-primary-ink'
                    : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
