'use client';

import { Check, X } from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * A boolean control. BUILD-PLAN.md §2 R15, §5.10.
 *
 * R15 requires every state to carry an icon and a text label, not colour alone.
 * A toggle is the easiest place in a product to break that rule, so the knob
 * here carries a tick or a cross and the control renders its on/off word beside
 * it. About one man in twelve cannot separate the on colour from the off one.
 */
export interface SwitchProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: string;
  readonly onLabel?: string | undefined;
  readonly offLabel?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly describedBy?: string | undefined;
  readonly className?: string | undefined;
}

export function Switch({
  checked,
  onChange,
  label,
  onLabel = 'On',
  offLabel = 'Off',
  disabled = false,
  describedBy,
  className,
}: SwitchProps) {
  const Icon = checked ? Check : X;

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-ok-soft border-ok' : 'bg-surface-sunken border-border',
        )}
      >
        <span
          className={cn(
            'flex size-5 items-center justify-center rounded-full transition-transform',
            checked
              ? 'bg-ok text-ink-inverse translate-x-6 rtl:-translate-x-6'
              : 'bg-border-strong text-ink-inverse translate-x-1 rtl:-translate-x-1',
          )}
        >
          <Icon aria-hidden="true" className="size-3" />
        </span>
      </button>
      <span className="text-ink-muted text-sm">{checked ? onLabel : offLabel}</span>
    </span>
  );
}
