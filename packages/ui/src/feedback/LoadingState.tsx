import { LoaderCircle } from 'lucide-react';
import { cn } from '../lib/cn';

/**
 * Loading state. BUILD-PLAN.md §19.
 *
 * The spinner is decorative and hidden from assistive technology; the status
 * text is what a screen reader announces. Under prefers-reduced-motion the
 * token layer flattens the animation, so the label carries the whole meaning
 * and must always be present.
 */
export interface LoadingStateProps {
  readonly label?: string | undefined;
  readonly inline?: boolean | undefined;
  readonly className?: string | undefined;
}

export function LoadingState({ label = 'Loading', inline = false, className }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'text-ink-muted flex items-center gap-2',
        inline ? 'inline-flex' : 'justify-center px-6 py-12',
        className,
      )}
    >
      <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      <span className={inline ? 'sr-only' : 'text-sm'}>{label}</span>
    </div>
  );
}
