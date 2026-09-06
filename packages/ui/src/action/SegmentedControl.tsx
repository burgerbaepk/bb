'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * A row of mutually exclusive chips. BUILD-PLAN.md §11.2, defects V6, V8.
 *
 * §11.2 is specific: render channels as chips, not tiles, and never let an empty
 * channel consume a third of the viewport. The system this replaces devotes two
 * thirds of the tray header to `Takeaway 0` and `Web 0` (V6), which is a lot of
 * screen for information nobody asked for.
 *
 * A count is part of the option rather than a separate label, so the chip and
 * its number come from the same source (R16).
 */
export interface SegmentOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly count?: number | undefined;
  readonly icon?: LucideIcon | undefined;
}

export interface SegmentedControlProps<T extends string> {
  readonly options: readonly SegmentOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  /** Names the group for a screen reader, e.g. "Filter by channel". */
  readonly label: string;
  readonly size?: 'sm' | 'md' | undefined;
  readonly className?: string | undefined;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  className,
}: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-1.5', className)}>
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border font-medium transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              active
                ? 'bg-primary text-primary-ink border-primary'
                : 'bg-surface-raised text-ink-muted border-border hover:text-ink',
            )}
          >
            {Icon !== undefined && <Icon aria-hidden="true" className="size-4 shrink-0" />}
            <span>{option.label}</span>
            {option.count !== undefined && (
              <span className={cn('tabular-nums', active ? 'opacity-80' : 'text-ink-subtle')}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
