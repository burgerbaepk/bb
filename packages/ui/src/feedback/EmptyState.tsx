import type { LucideIcon } from 'lucide-react';
import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * Empty state. BUILD-PLAN.md §19.
 *
 * An empty surface must say what would be here and how to put something here.
 * A blank panel is indistinguishable from a failed fetch, which is how a
 * broken screen survives to production.
 */
export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string | undefined;
  readonly icon?: LucideIcon | undefined;
  readonly action?: ReactNode | undefined;
  readonly className?: string | undefined;
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'border-border flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center',
        className,
      )}
    >
      <Icon aria-hidden="true" className="text-ink-subtle size-8" />
      <div className="space-y-1">
        <p className="text-ink font-medium">{title}</p>
        {description !== undefined && (
          <p className="text-ink-muted max-w-prose text-sm">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
