'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Money, cn } from '@natech/ui';
import type { MenuItem } from '@natech/contracts';

/**
 * Fast keyboard billing — the search box a cashier lives in for the whole
 * order. Digits get an exact product-number lookup; anything else searches
 * name and number together, arrow-navigable, `Enter` adds the highlighted
 * (or sole) match. Never opens a dialog itself — `OrderScreen` decides
 * whether the picked item needs one (a variant choice, a required modifier).
 */
export interface ProductSearchHandle {
  readonly focus: () => void;
}

export interface ProductSearchProps {
  readonly items: readonly MenuItem[];
  readonly onPick: (item: MenuItem) => void;
}

const MAX_RESULTS = 8;

export const ProductSearch = forwardRef<ProductSearchHandle, ProductSearchProps>(
  function ProductSearch({ items, onPick }, ref) {
    const [query, setQuery] = useState('');
    const [highlighted, setHighlighted] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), []);
    // The main entry point — focused the moment the order screen mounts.
    useEffect(() => {
      inputRef.current?.focus();
    }, []);

    const trimmed = query.trim();
    const results = useMemo(() => {
      if (trimmed === '') return [];
      const q = trimmed.toLowerCase();
      const found = items.filter(
        (item) =>
          item.isActive &&
          (item.name.toLowerCase().includes(q) || (item.sku?.toLowerCase().includes(q) ?? false)),
      );
      // The exact product-number match, if any, always leads the list.
      const exactIndex = found.findIndex((item) => item.sku === trimmed);
      if (exactIndex <= 0) return found.slice(0, MAX_RESULTS);
      const exact = found[exactIndex];
      if (exact === undefined) return found.slice(0, MAX_RESULTS);
      return [exact, ...found.filter((_, index) => index !== exactIndex)].slice(0, MAX_RESULTS);
    }, [items, trimmed]);

    const pick = (item: MenuItem) => {
      onPick(item);
      setQuery('');
      setHighlighted(0);
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlighted((current) => Math.min(current + 1, Math.max(results.length - 1, 0)));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlighted((current) => Math.max(current - 1, 0));
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault();

      // Priority 1 — an exact, active product-number match.
      if (/^\d+$/.test(trimmed)) {
        const exact = items.find((item) => item.isActive && item.sku === trimmed);
        if (exact !== undefined) {
          pick(exact);
          return;
        }
      }
      // Priority 2 — the highlighted result.
      const current = results[highlighted];
      if (current !== undefined) {
        pick(current);
        return;
      }
      // Priority 3 — an unambiguous name match.
      const sole = results[0];
      if (results.length === 1 && sole !== undefined) pick(sole);
    };

    return (
      <div className="border-border relative max-w-2xl border-b p-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlighted(0);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search by number or name..."
          aria-label="Search products by number or name"
          className="border-border bg-surface-raised text-ink min-h-touch w-full rounded-base border px-3 py-2 pe-12 text-base placeholder:text-ink-subtle"
        />
        {query === '' && (
          <kbd
            aria-hidden="true"
            className="border-border text-ink-subtle pointer-events-none absolute end-4 top-1/2 -translate-y-1/2 rounded border px-1.5 py-0.5 text-xs"
          >
            /
          </kbd>
        )}

        {results.length > 0 && (
          <ul className="border-border bg-surface-raised absolute inset-x-2 top-full z-10 mt-1 max-h-80 overflow-y-auto rounded-base border shadow-lg">
            {results.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  // Keeps focus (and the current selection) on the search
                  // input — a mousedown-triggered blur would otherwise fire
                  // before this button's own click handler runs.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(item)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-start text-sm',
                    index === highlighted
                      ? 'bg-primary text-primary-ink'
                      : 'hover:bg-surface-sunken',
                  )}
                >
                  {item.sku !== null && (
                    <span className="w-8 shrink-0 tabular-nums opacity-70">{item.sku}</span>
                  )}
                  <span className="flex-1 truncate">{item.name}</span>
                  <Money value={item.basePrice} trimWholeRupees />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },
);
