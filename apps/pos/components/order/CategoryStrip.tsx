'use client';

import { cn } from '@natech/ui';
import type { Category } from '@natech/contracts';

/**
 * The category strip — BUILD-PLAN.md §5.3, defect "category strip overflows".
 *
 * The grid this replaces lays thirteen categories across a fixed row and hides
 * categories 4 to 13 off the edge, where nobody finds them. Two things fix it:
 * the §5.3 variant collapse removes roughly two thirds of the tiles behind the
 * strip, and the strip itself scrolls rather than clipping.
 *
 * It wraps on a wide screen and scrolls horizontally on a narrow one, so every
 * category is reachable at 768px — the tablet this is actually operated on.
 */
export interface CategoryStripProps {
  readonly categories: readonly Category[];
  readonly counts: Readonly<Record<string, number>>;
  readonly selectedId: string | null;
  readonly onSelect: (categoryId: string | null) => void;
}

export function CategoryStrip({ categories, counts, selectedId, onSelect }: CategoryStripProps) {
  return (
    <div
      role="tablist"
      aria-label="Menu categories"
      className="border-border flex gap-1.5 overflow-x-auto border-b px-3 py-2 lg:flex-wrap lg:overflow-visible"
    >
      <StripButton
        active={selectedId === null}
        onClick={() => onSelect(null)}
        label="All"
        count={Object.values(counts).reduce((total, value) => total + value, 0)}
      />
      {categories.map((category) => (
        <StripButton
          key={category.id}
          active={selectedId === category.id}
          onClick={() => onSelect(category.id)}
          label={category.name}
          count={counts[category.id] ?? 0}
        />
      ))}
    </div>
  );
}

function StripButton({
  active,
  onClick,
  label,
  count,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly label: string;
  readonly count: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'min-h-touch shrink-0 rounded-base border px-3 py-2 text-sm font-medium whitespace-nowrap',
        'transition-colors duration-150 active:scale-[0.97]',
        active
          ? 'bg-primary text-primary-ink border-primary shadow-sm'
          : 'bg-surface-raised text-ink-muted border-border hover:border-border-strong hover:text-ink',
      )}
    >
      {label}
      <span className={cn('ms-2 tabular-nums', active ? 'opacity-75' : 'text-ink-subtle')}>
        {count}
      </span>
    </button>
  );
}
