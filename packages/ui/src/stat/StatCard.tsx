import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/**
 * A headline figure on a card. ADR 0020; BUILD-PLAN.md §14.2, §2 R1.
 *
 * Four screens had grown their own private `Metric`, `Mini`, `Tile`, and `Stat`
 * — the same eight lines, with four different answers to how big the number is
 * and how muted the label is. That is how a back office stops looking like one
 * product. This is the one answer.
 *
 * `value` is a `ReactNode` rather than a number on purpose: R1 says money is
 * formatted only at the render boundary, so what a caller passes here is a
 * `<Money>`, never a string it formatted itself. The card sets `tabular-nums`
 * so a figure that ticks between renders does not shuffle its own digits
 * sideways — a dashboard read across a counter reads as flicker otherwise.
 *
 * There is deliberately no trend or delta badge. Nothing in the product
 * computes a period-over-period comparison yet, and a card with a slot for one
 * invites filling it with a figure that was never queried — which is the C3/V1
 * shape R16 exists to prevent.
 */
export interface StatCardProps {
  readonly label: string;
  readonly value: ReactNode;
  /** The icon chip. Optional: a dense row of four reads better without one. */
  readonly icon?: LucideIcon | undefined;
  /**
   * What the figure counts, and over what period. A node rather than a string
   * because a caption routinely carries a second figure — "tax Rs. 1,380.60" —
   * and R1 says that figure is a `<Money>`, never a string the caller formatted.
   */
  readonly caption?: ReactNode | undefined;
  /** Rendered at the top-right — a link affordance, or a `StatusPill`. */
  readonly action?: ReactNode | undefined;
  readonly className?: string | undefined;
}

export function StatCard({ label, value, icon: Icon, caption, action, className }: StatCardProps) {
  return (
    <div
      className={cn(
        'border-border bg-surface-raised rounded-base border p-4',
        // The hover belongs to the card even when the caller is what is
        // clickable, so a wrapping <Link className="group"> gets the affordance
        // without the design system importing a router.
        'group-hover:border-border-strong transition-colors',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-ink-muted flex min-w-0 items-center gap-2 text-sm font-medium">
          {Icon !== undefined && (
            <span className="bg-surface-sunken text-ink-muted rounded-sm p-1.5">
              <Icon aria-hidden="true" className="size-4" />
            </span>
          )}
          <span className="truncate">{label}</span>
        </p>
        {action !== undefined && <span className="shrink-0">{action}</span>}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {caption !== undefined && <p className="text-ink-subtle mt-1 text-xs">{caption}</p>}
    </div>
  );
}
