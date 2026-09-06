import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { EmptyState } from '../feedback/EmptyState';
import { LoadingState } from '../feedback/LoadingState';

/**
 * A table. BUILD-PLAN.md §2 R16, §19, defects C3, V1.
 *
 * R16 says a header count and a header sum must derive from the same query as
 * the list they head. Here that is structural rather than advisory: `summary`
 * is a function of the `rows` being rendered, so it cannot be handed a figure
 * from somewhere else.
 *
 * The system this replaces shows `Total Revenue Rs. 0` beside `Total Orders
 * 19984` (C3), and a header reading four orders and Rs. 40,623.70 above three
 * cards summing Rs. 34,161.30 (V1). Both come from a header fed by a different
 * query than its list. This signature makes that shape impossible to express.
 */
export interface DataTableColumn<T> {
  readonly key: string;
  readonly header: ReactNode;
  readonly render: (row: T) => ReactNode;
  /** Right-align in LTR, left in RTL. Use for money and counts. */
  readonly numeric?: boolean | undefined;
  readonly widthClassName?: string | undefined;
  /** Hide below the `sm` breakpoint. */
  readonly secondary?: boolean | undefined;
}

export interface DataTableProps<T> {
  readonly rows: readonly T[];
  readonly columns: readonly DataTableColumn<T>[];
  readonly getRowId: (row: T) => string;
  /**
   * R16 — computed from the rows being rendered. There is deliberately no way
   * to pass a precomputed total.
   */
  readonly summary?: ((rows: readonly T[]) => ReactNode) | undefined;
  readonly caption?: string | undefined;
  readonly loading?: boolean | undefined;
  readonly emptyTitle?: string | undefined;
  readonly emptyDescription?: string | undefined;
  readonly onRowClick?: ((row: T) => void) | undefined;
  readonly className?: string | undefined;
}

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  summary,
  caption,
  loading = false,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  onRowClick,
  className,
}: DataTableProps<T>) {
  if (loading) return <LoadingState label={caption ?? 'Loading'} />;
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    // ADR 0020 — the table is a raised card on the page ground, so the header
    // is a rule rather than a filled grey bar. The fill was carrying the
    // separation when the card sat darker than its page; now the elevation
    // does, and a second grey band only muddies it.
    <div
      className={cn(
        'border-border bg-surface-raised overflow-x-auto rounded-base border',
        className,
      )}
    >
      {summary !== undefined && (
        // Marked, the same way `Money` is: an R16 test has to find this bar to
        // assert the header agrees with the rows, and a test that finds it by
        // its Tailwind classes breaks on the next restyle without the header
        // having become any less honest.
        <div
          data-table-summary=""
          className="border-border text-ink-muted border-b px-4 py-2.5 text-sm"
        >
          {summary(rows)}
        </div>
      )}
      <table className="w-full border-collapse text-start text-sm">
        {caption !== undefined && <caption className="sr-only">{caption}</caption>}
        <thead className="border-border border-b">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  // Sentence case, not uppercase: a header set in caps costs a
                  // reader the word shape they scan a column by, and every one
                  // of these columns is a word an operator already knows.
                  'text-ink-muted px-4 py-2.5 text-xs font-medium',
                  column.numeric === true ? 'text-end' : 'text-start',
                  column.secondary === true && 'hidden sm:table-cell',
                  column.widthClassName,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={getRowId(row)}
              onClick={onRowClick === undefined ? undefined : () => onRowClick(row)}
              className={cn(
                'border-border border-t',
                // Sunken, not raised: the row already sits on the raised card,
                // so a raised hover is a hover that does nothing.
                onRowClick !== undefined && 'hover:bg-surface-sunken cursor-pointer',
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    'px-4 py-2.5',
                    column.numeric === true ? 'text-end' : 'text-start',
                    column.secondary === true && 'hidden sm:table-cell',
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
