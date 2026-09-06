import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * Error state. BUILD-PLAN.md §19.
 *
 * Carries an icon and a text label beside the colour, per R15. A red panel
 * with no words is not an error message.
 *
 * `detail` is for an operator, not a customer: a reason code, a failed
 * authority response. It is rendered in mono so a support call can read it out.
 */
export interface ErrorStateProps {
  readonly title: string;
  readonly description?: string | undefined;
  readonly detail?: string | undefined;
  readonly action?: ReactNode | undefined;
  readonly className?: string | undefined;
}

export function ErrorState({ title, description, detail, action, className }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'border-danger bg-danger-soft flex flex-col items-center gap-3 rounded-lg border px-6 py-10 text-center',
        className,
      )}
    >
      <CircleAlert aria-hidden="true" className="text-danger size-8" />
      <div className="space-y-1">
        <p className="text-danger font-semibold">{title}</p>
        {description !== undefined && <p className="text-ink max-w-prose text-sm">{description}</p>}
      </div>
      {detail !== undefined && (
        <code className="text-ink-muted bg-surface-sunken max-w-full overflow-x-auto rounded px-2 py-1 font-mono text-xs">
          {detail}
        </code>
      )}
      {action}
    </div>
  );
}
