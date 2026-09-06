import { Clock, TriangleAlert, Flame } from 'lucide-react';
import { cn } from '../lib/cn';
import {
  clampSeconds,
  durationState,
  formatDuration,
  formatOverdueBy,
  type DurationState,
  type DurationThresholds,
} from './format';

/**
 * Render an elapsed duration. BUILD-PLAN.md §2 R13, R15, §10.3.
 *
 * A negative value cannot be rendered: `seconds` is clamped before it reaches
 * the formatter, so defect V2 is unreachable through this component regardless
 * of what a caller passes.
 *
 * When `thresholds` are supplied the state is colour-coded, and R15 then
 * requires an icon and a text label alongside the colour. Both are emitted, and
 * the label is available to a screen reader even when it is visually hidden.
 */
export interface DurationProps {
  readonly seconds: number;
  /** Colour-code against these. Omit for a plain timer. */
  readonly thresholds?: DurationThresholds | undefined;
  /** Show the state word next to the icon rather than only to assistive tech. */
  readonly showStateLabel?: boolean | undefined;
  readonly className?: string | undefined;
  readonly label?: string | undefined;
}

const STATE_STYLES: Record<DurationState, string> = {
  OK: 'text-ink-muted',
  WARN: 'text-warn',
  OVERDUE: 'text-danger font-semibold',
};

const STATE_ICON = {
  OK: Clock,
  WARN: TriangleAlert,
  OVERDUE: Flame,
} as const;

const STATE_LABEL: Record<DurationState, string> = {
  OK: 'On time',
  WARN: 'Approaching target',
  OVERDUE: 'Overdue',
};

export function Duration({
  seconds,
  thresholds,
  showStateLabel = false,
  className,
  label,
}: DurationProps) {
  const safe = clampSeconds(seconds);
  const state = thresholds === undefined ? 'OK' : durationState(safe, thresholds);

  const isOverdue = state === 'OVERDUE' && thresholds !== undefined;
  const text = isOverdue ? formatOverdueBy(safe, thresholds.overdueSeconds) : formatDuration(safe);

  const Icon = STATE_ICON[state];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 tabular-nums',
        thresholds !== undefined && STATE_STYLES[state],
        className,
      )}
      dir="ltr"
      aria-label={label === undefined ? undefined : `${label}: ${text}`}
    >
      {thresholds !== undefined && <Icon aria-hidden="true" className="size-4 shrink-0" />}
      <span>{text}</span>
      {thresholds !== undefined &&
        (showStateLabel ? (
          <span className="text-xs font-medium uppercase">{STATE_LABEL[state]}</span>
        ) : (
          <span className="sr-only">{STATE_LABEL[state]}</span>
        ))}
    </span>
  );
}
