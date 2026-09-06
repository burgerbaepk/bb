'use client';

import { useMemo, useState } from 'react';
import { ChartNoAxesColumn } from 'lucide-react';
import { EmptyState, Money, SegmentedControl, formatPaisa } from '@natech/ui';
import { paisa } from '@natech/domain';
import {
  axisNote,
  bucketise,
  type SalesSeriesRow,
  type TrendGrain,
  type TrendPoint,
} from '@/lib/dashboard/trend';

/**
 * Sales trend — BUILD-PLAN.md §14.2, §17, §2 R1, R16; ADR 0023.
 *
 * The bars are gross takings, because that is the figure a manager standing at
 * the pass is actually asking about: what crossed the counter. Net sales and
 * covers are on the readout beside it rather than as a second series — two
 * overlaid series on a card this size is a chart you have to study, and this
 * one has to be readable in the two seconds between services.
 *
 * The whole year is sent once and re-bucketed here, so switching grain is
 * instant and, more to the point, all three views are folds of one query. Three
 * queries could return three windows that do not sum to each other, and a
 * manager would have no way to tell which one was wrong (R16).
 *
 * There is no floating tooltip. A popover on the right-most bar clips out of
 * the card, and on a touch screen it has nowhere to live at all; a fixed
 * readout above the chart has neither problem and is legible with a thumb on
 * the bar. Each bar is a real `<button>`, so the same detail is reachable by
 * keyboard and announced in full.
 *
 * Bars are plain elements sized by percentage rather than an SVG or a chart
 * library. Fourteen `<div>`s in a flex row are responsive for free, inherit the
 * theme tokens, and add nothing to the bundle of a screen that is opened
 * dozens of times a shift.
 */

const GRAIN_OPTIONS = [
  { value: 'DAILY' as const, label: 'Daily' },
  { value: 'WEEKLY' as const, label: 'Weekly' },
  { value: 'MONTHLY' as const, label: 'Monthly' },
];

const GRAIN_NOUN: Readonly<Record<TrendGrain, string>> = {
  DAILY: 'day',
  WEEKLY: 'week',
  MONTHLY: 'month',
};

/** Enough of a bar to read as "zero", not as "missing". */
const ZERO_BAR_PERCENT = 1.5;

/**
 * Exactly one background utility per bar.
 *
 * Two Tailwind utilities for the same property have the same specificity, so
 * which one wins is decided by their order in the generated stylesheet, not by
 * their order in the class attribute. Composing `bg-primary/80` with a
 * conditional `bg-primary` therefore highlights the hovered bar on some builds
 * and not others. Picking one class removes the question.
 *
 * Highlighting keys off `active` rather than `:hover`, so a tap, a mouse and a
 * Tab key all light the same bar as they fill the same readout.
 */
function barTone(point: TrendPoint, active: boolean): string {
  if (point.grossTakings === 0n) return 'bg-border';
  // The bucket still being traded in is not comparable to a whole one. Half a
  // month of takings beside eleven full ones reads as a collapse unless marked.
  if (point.partial) return active ? 'bg-primary/60' : 'bg-primary/40';
  return active ? 'bg-primary' : 'bg-primary/80';
}

export interface SalesTrendProps {
  readonly businessDate: string;
  readonly series: readonly SalesSeriesRow[];
}

export function SalesTrend({ businessDate, series }: SalesTrendProps) {
  const [grain, setGrain] = useState<TrendGrain>('DAILY');
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const points = useMemo(
    () => bucketise(grain, businessDate, series),
    [grain, businessDate, series],
  );

  // Every summary figure below is folded from `points` — the same array the
  // bars are drawn from — so the headline and the chart cannot disagree (R16).
  const tallest = points.reduce(
    (max, point) => (point.grossTakings > max ? point.grossTakings : max),
    0n,
  );
  const total = paisa(points.reduce((running, point) => running + point.grossTakings, 0n));
  const invoiceCount = points.reduce((running, point) => running + point.invoiceCount, 0);
  const covers = points.reduce((running, point) => running + point.covers, 0);
  const trading = points.filter((point) => point.invoiceCount > 0).length;
  const average = paisa(trading === 0 ? 0n : total / BigInt(trading));

  const active = points.find((point) => point.key === activeKey) ?? null;

  // A year with no finalized invoice in it draws twelve flat grey stubs, which
  // is indistinguishable from a fetch that failed — the exact failure
  // `EmptyState` exists to stop (§19). An outlet that has genuinely not traded
  // is told so in words.
  if (series.length === 0) {
    return (
      <section className="border-border bg-surface-raised rounded-base border p-5">
        <h2 className="font-semibold tracking-tight">Sales trend</h2>
        <p className="text-ink-muted mb-4 text-sm">Gross takings, finalized invoices only.</p>
        <EmptyState
          icon={ChartNoAxesColumn}
          title="No sales to chart yet"
          description="Nothing has been finalized in the last twelve months. The trend appears here after the first tax invoice is issued."
        />
      </section>
    );
  }

  return (
    <section className="border-border bg-surface-raised rounded-base flex flex-col border p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold tracking-tight">Sales trend</h2>
          <p className="text-ink-muted text-sm">
            Gross takings per {GRAIN_NOUN[grain]}, finalized invoices only.
          </p>
        </div>
        <SegmentedControl
          label="Sales trend period"
          size="sm"
          value={grain}
          onChange={setGrain}
          options={GRAIN_OPTIONS}
        />
      </div>

      {/* The readout. It shows the whole period until a bar is pointed at or
          focused, and the sub-line always names what the big figure counts, so
          the two states are never mistaken for one another. */}
      <div className="mb-4 min-h-14">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          <Money value={active === null ? total : active.grossTakings} symbol="Rs." />
        </p>
        <p className="text-ink-muted mt-0.5 text-sm">
          {active === null ? (
            <>
              {points.length} {GRAIN_NOUN[grain]}s · {invoiceCount} invoices · {covers} covers ·
              average <Money value={average} symbol="Rs." trimWholeRupees /> per trading{' '}
              {GRAIN_NOUN[grain]}
            </>
          ) : (
            <>
              {active.fullLabel}
              {active.partial && ' (so far)'} · {active.invoiceCount} invoices · {active.covers}{' '}
              covers · net <Money value={active.netSales} symbol="Rs." trimWholeRupees />
            </>
          )}
        </p>
      </div>

      <div
        role="group"
        aria-label={`Gross takings by ${GRAIN_NOUN[grain]}`}
        className="flex items-end gap-1"
        onMouseLeave={() => setActiveKey(null)}
      >
        {points.map((point) => {
          const height =
            tallest === 0n ? 0 : Number((point.grossTakings * 10_000n) / tallest) / 100;
          return (
            <button
              key={point.key}
              type="button"
              // A bar is not a navigation. Pointing at it or tabbing to it is
              // the whole interaction, so the click handler exists only so a
              // touch user gets the same readout a mouse user gets on hover.
              onClick={() => setActiveKey(point.key)}
              onMouseEnter={() => setActiveKey(point.key)}
              onFocus={() => setActiveKey(point.key)}
              onBlur={() => setActiveKey(null)}
              aria-label={`${point.fullLabel}${point.partial ? ', in progress' : ''}: ${formatPaisa(point.grossTakings, { symbol: 'Rs.', trimWholeRupees: true })}, ${point.invoiceCount} invoices, ${point.covers} covers`}
              className="focus-visible:ring-primary flex h-40 flex-1 cursor-pointer flex-col justify-end rounded-sm focus-visible:ring-2 focus-visible:outline-none"
            >
              <span
                style={{ height: `${Math.max(height, ZERO_BAR_PERCENT)}%` }}
                className={`block w-full rounded-t-sm transition-colors ${barTone(point, activeKey === point.key)}`}
              />
            </button>
          );
        })}
      </div>

      <div className="mt-1.5 flex gap-1">
        {points.map((point) => (
          <span key={point.key} className="flex-1 text-center">
            <span className="text-ink-subtle block text-[10px] leading-tight tabular-nums">
              {point.label}
            </span>
            <span className="text-ink-subtle block h-3 text-[10px] leading-tight font-medium">
              {point.groupLabel}
            </span>
          </span>
        ))}
      </div>
      <p className="text-ink-subtle mt-2 text-xs">{axisNote(grain)}</p>
    </section>
  );
}
