'use client';

import { Delete } from 'lucide-react';
import { useCallback, useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { formatPaisa } from '../money/format';

/**
 * Numeric keypad. BUILD-PLAN.md §14.2, §18 (M04 payment sheet), §19.
 *
 * Two jobs: the 4-to-6 digit staff PIN that identifies a cashier per till
 * action (§14.2), and amount entry on the payment sheet.
 *
 * Amount entry is paisa-first, the way every till works: pressing 1, 3, 5, 0
 * gives Rs. 13.50. Nobody types a decimal point during service, and offering
 * one invites a cashier to enter 1350 and take a hundredfold overpayment.
 *
 * Digits never become a `number`. `digitsToPaisa` goes from string straight to
 * `bigint`, so R1 holds through the entry path as well as the display path.
 */

/** Entered digits straight to paisa: "1350" becomes 1350n, which is Rs. 13.50. */
export function digitsToPaisa(digits: string): bigint {
  const cleaned = digits.replace(/[^0-9]/g, '');
  if (cleaned.length === 0) return 0n;
  return BigInt(cleaned);
}

/**
 * `percent` is whole percent points, for a percentage discount (ADR 0028).
 * The caller converts to paisa; the keypad only ever holds digits.
 */
export type KeypadMode = 'pin' | 'amount' | 'percent';

export interface NumericKeypadProps {
  readonly mode: KeypadMode;
  readonly value: string;
  readonly onChange: (digits: string) => void;
  /** PIN mode: 4 to 6 digits per §14.2. */
  readonly maxLength?: number | undefined;
  readonly label: string;
  readonly currencySymbol?: string | undefined;
  readonly className?: string | undefined;
  /**
   * Till hardware is not assumed to be touch (§8's own till fleet is not
   * either) — a keypad nobody has clicked into yet is unreachable from a
   * physical keyboard until something focuses it. Set this whenever the
   * keypad is the first/only thing to interact with on the screen it just
   * appeared on.
   */
  readonly autoFocus?: boolean | undefined;
  /**
   * `Enter` on a real keyboard — there is no text field here for the browser
   * to submit natively on its own, so the caller decides what "done" means
   * (submit a form, close a sheet) and whether the current `value` is
   * complete enough to act on.
   */
  readonly onSubmit?: (() => void) | undefined;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const;

export function NumericKeypad({
  mode,
  value,
  onChange,
  maxLength = mode === 'pin' ? 6 : mode === 'percent' ? 3 : 9,
  label,
  currencySymbol = 'Rs.',
  className,
  autoFocus = false,
  onSubmit,
}: NumericKeypadProps) {
  const groupRef = useRef<HTMLDivElement>(null);

  // The native `autofocus` HTML attribute only takes effect on an element the
  // browser's own parser inserted — never one React creates at runtime, which
  // is every element here — so this component has to focus itself rather
  // than rely on passing the attribute through.
  useEffect(() => {
    if (autoFocus) groupRef.current?.focus();
  }, [autoFocus]);

  const append = useCallback(
    (digit: string) => {
      if (value.length >= maxLength) return;
      // Avoid a run of leading zeros that would read as an amount it is not.
      const next = value === '0' ? digit : value + digit;
      onChange(next);
    },
    [value, maxLength, onChange],
  );

  const backspace = useCallback(() => {
    onChange(value.slice(0, -1));
  }, [value, onChange]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key >= '0' && event.key <= '9') {
        event.preventDefault();
        append(event.key);
        return;
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        backspace();
      }
      if (event.key === 'Enter' && onSubmit !== undefined) {
        event.preventDefault();
        onSubmit();
      }
    },
    [append, backspace, onSubmit],
  );

  const display =
    mode === 'pin'
      ? '•'.repeat(value.length).padEnd(Math.max(4, value.length), '·')
      : mode === 'percent'
        ? `${digitsToPaisa(value).toString()}%`
        : formatPaisa(digitsToPaisa(value), { symbol: currencySymbol });

  return (
    <div
      ref={groupRef}
      className={cn('flex w-full max-w-xs flex-col gap-3', className)}
      onKeyDown={handleKeyDown}
      role="group"
      aria-label={label}
      tabIndex={0}
    >
      <output
        className={cn(
          'border-border bg-surface-sunken flex min-h-14 items-center justify-center rounded-lg border px-4 text-2xl tabular-nums',
          mode === 'pin' && 'tracking-[0.4em]',
        )}
        aria-live="polite"
        dir="ltr"
      >
        {display}
      </output>

      <div className="grid grid-cols-3 gap-2">
        {KEYS.slice(0, 9).map((key) => (
          <KeypadButton key={key} onPress={() => append(key)} label={key} />
        ))}
        <div aria-hidden="true" />
        <KeypadButton onPress={() => append('0')} label="0" />
        <KeypadButton onPress={backspace} label="Delete last digit" icon>
          <Delete aria-hidden="true" className="size-5" />
        </KeypadButton>
      </div>
    </div>
  );
}

function KeypadButton({
  onPress,
  label,
  icon = false,
  children,
}: {
  readonly onPress: () => void;
  readonly label: string;
  readonly icon?: boolean | undefined;
  readonly children?: ReactNode | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={icon ? label : undefined}
      className={cn(
        'border-border bg-surface-raised hover:bg-surface-sunken active:bg-surface-sunken',
        'flex min-h-(--spacing-touch) items-center justify-center rounded-lg border text-xl font-medium',
        'py-3 tabular-nums',
      )}
    >
      {children ?? label}
    </button>
  );
}
