'use client';

import { useId, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/**
 * Form controls. BUILD-PLAN.md §5.10, §9.4, §14.3, §19.
 *
 * The admin back office is almost entirely forms: the menu manager, the floor
 * plan editor, the settings registry, the branding editor. Each one needs a
 * label bound to its control, a help line bound as a description, and an error
 * that a screen reader announces. Doing that once here is the difference
 * between an axe-clean back office (M18) and forty places to get it wrong.
 */
interface FieldShellProps {
  readonly label: string;
  readonly help?: string | undefined;
  readonly error?: string | undefined;
  readonly required?: boolean | undefined;
  readonly className?: string | undefined;
  readonly children: (ids: { control: string; described: string | undefined }) => ReactNode;
}

export function FieldShell({
  label,
  help,
  error,
  required = false,
  className,
  children,
}: FieldShellProps) {
  const base = useId();
  const controlId = `${base}-control`;
  const helpId = `${base}-help`;
  const errorId = `${base}-error`;

  const described = error !== undefined ? errorId : help !== undefined ? helpId : undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={controlId} className="text-ink text-sm font-medium">
        {label}
        {required && (
          <span className="text-danger ms-1" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {children({ control: controlId, described })}

      {help !== undefined && error === undefined && (
        <p id={helpId} className="text-ink-muted text-xs">
          {help}
        </p>
      )}
      {error !== undefined && (
        <p id={errorId} role="alert" className="text-danger text-xs font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

const CONTROL_STYLES =
  'border-border bg-surface-raised text-ink min-h-touch rounded-base border px-3 py-2 text-base placeholder:text-ink-subtle disabled:opacity-50';

export interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className' | 'id'
> {
  readonly label: string;
  readonly help?: string | undefined;
  readonly error?: string | undefined;
  readonly className?: string | undefined;
  /** Money and codes read better in tabular figures. */
  readonly tabular?: boolean | undefined;
}

export function TextField({
  label,
  help,
  error,
  className,
  tabular = false,
  required,
  ...rest
}: TextFieldProps) {
  return (
    <FieldShell label={label} help={help} error={error} required={required} className={className}>
      {({ control, described }) => (
        <input
          id={control}
          aria-describedby={described}
          aria-invalid={error === undefined ? undefined : true}
          required={required}
          className={cn(
            CONTROL_STYLES,
            tabular && 'tabular-nums',
            error !== undefined && 'border-danger',
          )}
          {...rest}
        />
      )}
    </FieldShell>
  );
}

export interface SelectFieldOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectFieldProps extends Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'className' | 'id' | 'children'
> {
  readonly label: string;
  readonly help?: string | undefined;
  readonly error?: string | undefined;
  readonly options: readonly SelectFieldOption[];
  readonly className?: string | undefined;
}

export function SelectField({
  label,
  help,
  error,
  options,
  className,
  required,
  ...rest
}: SelectFieldProps) {
  return (
    <FieldShell label={label} help={help} error={error} required={required} className={className}>
      {({ control, described }) => (
        <select
          id={control}
          aria-describedby={described}
          aria-invalid={error === undefined ? undefined : true}
          required={required}
          className={cn(CONTROL_STYLES, error !== undefined && 'border-danger')}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}

export interface TextAreaFieldProps {
  readonly label: string;
  readonly help?: string | undefined;
  readonly error?: string | undefined;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly rows?: number | undefined;
  readonly placeholder?: string | undefined;
  /**
   * A single passthrough, not the whole `TextareaHTMLAttributes` surface: the
   * storefront's delivery address is a textarea, and without
   * `autocomplete="street-address"` the browser cannot offer the address it
   * already holds — on the one field in the product where retyping is most
   * likely to be got wrong.
   */
  readonly autoComplete?: string | undefined;
  readonly className?: string | undefined;
}

export function TextAreaField({
  label,
  help,
  error,
  value,
  onChange,
  rows = 3,
  placeholder,
  autoComplete,
  className,
}: TextAreaFieldProps) {
  return (
    <FieldShell label={label} help={help} error={error} className={className}>
      {({ control, described }) => (
        <textarea
          id={control}
          aria-describedby={described}
          rows={rows}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          className={cn(CONTROL_STYLES, 'min-h-20 resize-y')}
        />
      )}
    </FieldShell>
  );
}
