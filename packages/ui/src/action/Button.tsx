import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * A button. BUILD-PLAN.md §18 M04, §19, defect V4.
 *
 * Not in the M01 component list, and needed by every screen in Phase 1. Three
 * apps assembling surfaces without one would have produced three button
 * implementations, three focus treatments, and three answers to what a
 * destructive action looks like.
 *
 * `tone="danger"` exists so that a void, a refund, or a block reads as
 * destructive at a glance. §11.3 keeps those out of the primary row entirely —
 * the system this replaces puts a delete icon next to `LOAD ORDER` (V4) — but a
 * destructive action still has to look different where it does appear.
 *
 * The touch target is 44px at the default size, because the POS is operated by
 * someone who is often holding a plate (§14.2, the `--spacing-touch` token).
 */
export type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  readonly tone?: ButtonTone | undefined;
  readonly size?: ButtonSize | undefined;
  readonly icon?: LucideIcon | undefined;
  /** Renders the icon after the label instead of before it. */
  readonly iconAfter?: boolean | undefined;
  readonly block?: boolean | undefined;
  readonly children?: ReactNode | undefined;
  readonly className?: string | undefined;
}

const TONES: Record<ButtonTone, string> = {
  primary: 'bg-primary text-primary-ink hover:bg-primary-hover border-primary shadow-sm',
  secondary: 'bg-surface-raised text-ink border-border hover:bg-surface-sunken',
  // Sunken, not raised: a ghost button sits on both the page ground and a
  // raised card, and only the sunken step is darker than both (ADR 0020).
  ghost: 'bg-transparent text-ink-muted border-transparent hover:bg-surface-sunken hover:text-ink',
  danger: 'bg-danger-soft text-danger border-danger hover:bg-danger hover:text-ink-inverse',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-8 px-2.5 py-1 text-sm gap-1.5',
  md: 'min-h-touch px-4 py-2 text-base gap-2',
  lg: 'min-h-14 px-6 py-3 text-lg gap-2.5',
};

const ICON_SIZES: Record<ButtonSize, string> = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-6',
};

export function Button({
  tone = 'secondary',
  size = 'md',
  icon: Icon,
  iconAfter = false,
  block = false,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const glyph =
    Icon === undefined ? null : (
      <Icon aria-hidden="true" className={cn('shrink-0', ICON_SIZES[size])} />
    );

  return (
    <button
      // Defaulted to "button" in the signature. A bare <button> inside a form
      // submits it, and the payment sheet is a form-shaped surface.
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-base border font-medium',
        'transition-[background-color,box-shadow,transform] active:scale-[0.97]',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        TONES[tone],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {!iconAfter && glyph}
      {children}
      {iconAfter && glyph}
    </button>
  );
}

/** An icon-only button. The accessible name is required, not optional. */
export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'icon' | 'iconAfter'> {
  readonly icon: LucideIcon;
  readonly label: string;
}

export function IconButton({
  icon: Icon,
  label,
  size = 'md',
  className,
  ...rest
}: IconButtonProps) {
  return (
    <Button
      size={size}
      aria-label={label}
      title={label}
      className={cn('aspect-square px-0', className)}
      {...rest}
    >
      <Icon aria-hidden="true" className={ICON_SIZES[size]} />
    </Button>
  );
}
