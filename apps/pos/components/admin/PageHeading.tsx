import type { ReactNode } from 'react';

/**
 * A back-office page heading.
 *
 * `note` is not decoration. Every admin screen here states what the thing it
 * edits is for and what breaks when it is wrong, because the person editing a
 * tax policy at 23:00 is not the person who read the build plan.
 */
export function PageHeading({
  title,
  note,
  actions,
}: {
  readonly title: string;
  readonly note?: string | undefined;
  readonly actions?: ReactNode | undefined;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {note !== undefined && <p className="text-ink-muted mt-1 max-w-3xl text-sm">{note}</p>}
      </div>
      {actions !== undefined && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
