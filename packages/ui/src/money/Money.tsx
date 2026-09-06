import { cn } from '../lib/cn';
import { formatPaisa, type FormatPaisaOptions } from './format';

/**
 * Render a monetary value. BUILD-PLAN.md §2 R1, §6.9.
 *
 * `value` is `bigint` paisa. In M03 the tax engine introduces the branded
 * `Paisa` type, which is a compile-time refinement of `bigint` and will narrow
 * this signature without changing a caller.
 *
 * Every rendered figure carries `data-money`, so a component test can assert
 * a money figure is (or is not) present on a given surface without parsing
 * rendered text.
 */
export interface MoneyProps extends FormatPaisaOptions {
  readonly value: bigint;
  /** Tabular figures so columns of money align. On by default. */
  readonly tabular?: boolean | undefined;
  readonly emphasis?: 'normal' | 'strong' | 'muted' | undefined;
  readonly className?: string | undefined;
  /** Screen-reader label, e.g. "Grand total". */
  readonly label?: string | undefined;
}

const EMPHASIS: Record<NonNullable<MoneyProps['emphasis']>, string> = {
  normal: '',
  strong: 'font-semibold text-ink',
  muted: 'text-ink-muted',
};

export function Money({
  value,
  tabular = true,
  emphasis = 'normal',
  className,
  label,
  ...formatOptions
}: MoneyProps) {
  const text = formatPaisa(value, formatOptions);

  return (
    <span
      data-money=""
      data-paisa={value.toString()}
      aria-label={label === undefined ? undefined : `${label}: ${text}`}
      className={cn(
        // §15.2 — money is Western digits in every locale, so the direction is
        // pinned even inside an RTL paragraph.
        'inline-block whitespace-nowrap',
        tabular && 'tabular-nums',
        EMPHASIS[emphasis],
        className,
      )}
      dir="ltr"
    >
      {text}
    </span>
  );
}
