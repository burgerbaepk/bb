import type { LucideIcon } from 'lucide-react';
import {
  Ban,
  CalendarClock,
  ChefHat,
  CreditCard,
  Sparkles,
  UtensilsCrossed,
  Users,
} from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * A state chip. BUILD-PLAN.md §2 R15, §9.1.
 *
 * R15: every colour-coded state carries an icon and a text label. That is
 * expressed here in the type — `label` is required and `icon` is required, so a
 * chip that means something only by being red cannot be constructed. It is not
 * a lint rule or a review note; the component has no colour-only form.
 *
 * This matters for more than accessibility. A floor plan is read across a room,
 * often by staff on their second week, and about one man in twelve cannot
 * separate the red state from the green one.
 */
export type PillTone = 'neutral' | 'info' | 'ok' | 'warn' | 'danger';

export interface StatusPillProps {
  /** Required. The state must be readable as words. */
  readonly label: string;
  /** Required. The state must be readable as a shape. */
  readonly icon: LucideIcon;
  readonly tone?: PillTone | undefined;
  readonly size?: 'sm' | 'md' | undefined;
  /** §9.1 — FREE is drawn as a dashed outline rather than a filled chip. */
  readonly outline?: boolean | undefined;
  readonly className?: string | undefined;
}

const TONE_FILLED: Record<PillTone, string> = {
  neutral: 'bg-surface-sunken text-ink-muted border-border',
  info: 'bg-info-soft text-info border-info',
  ok: 'bg-ok-soft text-ok border-ok',
  warn: 'bg-warn-soft text-warn border-warn',
  danger: 'bg-danger-soft text-danger border-danger',
};

const TONE_OUTLINE: Record<PillTone, string> = {
  neutral: 'text-ink-muted border-border-strong border-dashed',
  info: 'text-info border-info border-dashed',
  ok: 'text-ok border-ok border-dashed',
  warn: 'text-warn border-warn border-dashed',
  danger: 'text-danger border-danger border-dashed',
};

export function StatusPill({
  label,
  icon: Icon,
  tone = 'neutral',
  size = 'md',
  outline = false,
  className,
}: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        outline ? TONE_OUTLINE[tone] : cn(TONE_FILLED[tone], 'shadow-sm'),
        className,
      )}
    >
      <Icon aria-hidden="true" className={cn('shrink-0', size === 'sm' ? 'size-3.5' : 'size-4')} />
      <span>{label}</span>
    </span>
  );
}

/**
 * §9.1 table states, with the icon each one is specified to carry. Exported so
 * that M09b renders the floor plan from the plan rather than from memory.
 */
export type TableState =
  'FREE' | 'RESERVED' | 'SEATED' | 'ORDERED' | 'SERVED' | 'PAYING' | 'CLEANING' | 'BLOCKED';

export interface TableStatePreset {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly tone: PillTone;
  readonly outline: boolean;
  readonly meaning: string;
}

export const TABLE_STATE_PRESETS: Record<TableState, TableStatePreset> = {
  // §9.1 gives FREE no icon and a dashed border. A chip still needs a shape, so
  // it takes the bussing icon in outline form; the dashed border is the signal.
  FREE: {
    label: 'Free',
    icon: Sparkles,
    tone: 'neutral',
    outline: true,
    meaning: 'Clean, available',
  },
  RESERVED: {
    label: 'Reserved',
    icon: CalendarClock,
    tone: 'info',
    outline: false,
    meaning: 'Booked, not arrived',
  },
  SEATED: {
    label: 'Seated',
    icon: Users,
    tone: 'info',
    outline: false,
    meaning: 'Guests down, nothing ordered',
  },
  ORDERED: {
    label: 'Ordered',
    icon: ChefHat,
    tone: 'warn',
    outline: false,
    meaning: 'Order open, being prepared',
  },
  SERVED: {
    label: 'Served',
    icon: UtensilsCrossed,
    tone: 'ok',
    outline: false,
    meaning: 'Food is at the table',
  },
  PAYING: {
    label: 'Paying',
    icon: CreditCard,
    tone: 'info',
    outline: false,
    meaning: 'Payment sheet open',
  },
  CLEANING: {
    label: 'Cleaning',
    icon: Sparkles,
    tone: 'neutral',
    outline: false,
    meaning: 'Needs bussing',
  },
  BLOCKED: {
    label: 'Blocked',
    icon: Ban,
    tone: 'danger',
    outline: false,
    meaning: 'Out of service',
  },
};
