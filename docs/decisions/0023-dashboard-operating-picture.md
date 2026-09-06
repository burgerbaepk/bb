# 0023 — rebuild the dashboard as an operating picture, and drop tax from it

**Status:** accepted
**Date:** 2026-09-05
**Milestone:** post-M19 (product request, not a numbered milestone)
**Supersedes:** nothing in `docs/BUILD-PLAN.md`. No data contract changes
(`packages/contracts` is untouched, ADR 0008 holds), no migration, no rule
R1–R17 changes, no permission changes — the screen is still gated on
`reports.read`.

## Context

The product owner, reading the screen as a restaurateur rather than as a
developer, asked for three things: a sales trend they can flip between daily,
weekly and monthly; a card showing which products actually sell; and no tax on
the dashboard.

The screen as built after ADR 0020 answered a narrower question. It showed
today's gross takings, today's invoice count, live orders and tax collected,
with no history at all. Four figures with no denominator behind them: a manager
could read `Rs. 184,300` and had no way to know whether that was a good
Saturday. Everything that would have told them lived two clicks away in
`/admin/reports/sales`, behind a date range they had to choose first.

## Decision

**1. Tax comes off the dashboard.** The `Tax collected` card is removed, and
with it the `readTaxPolicy()` call that decided whether to render it.

Tax is authoritative exactly once, at finalize, after the payment method is
known (R9). What a manager saw on this card was the running sum of that day's
`invoices.tax_total` — correct, but it is a number with the shape of a return
and none of the standing of one, sitting on a screen otherwise made of
operating figures. §17's tax report and §7.10's compliance dashboard are where
that question is asked, and both frame it as the statutory question it is.

Nothing about R9 or the tax engine changes. The column is still read by the tax
report; it is only no longer surfaced here.

**2. A sales trend, bucketed in the browser from one query.** The page reads a
single daily series covering the widest window any grain needs — the first day
of the twelfth month back — and `lib/dashboard/trend.ts` folds it into fourteen
days, twelve weeks or twelve months on demand.

The alternative was a query per grain, driven from the URL like the §17
reports. It was rejected on R16 grounds: three windows read separately can
return three sets of figures that do not sum to one another, and a manager
comparing "this month" against the daily bars has no way to tell which one is
wrong. Folding one series means every view is arithmetically the same data, the
grain switch costs no round trip, and today's headline figure is literally the
last bar of the chart — read out of the same array.

`trend.ts` deliberately carries no `server-only` and no framework import: the
server uses it to decide how far back to read, and the client uses it to lay
that window out. If the two computed their own windows the query would read
eleven months while the axis claimed twelve, and nothing would fail.

**3. Aggregation moves into SQL for this screen only.** `lib/reports/sales.ts`
reads rows and folds them in JavaScript, which is right for a report: it is
opened deliberately, over a chosen window, and the fold keeps money in `bigint`
end to end. It is wrong for the back office's front door with a one-year
window — a busy outlet would ship tens of thousands of invoice rows over the
`dbRead` HTTP driver on every visit.

R1 survives the move intact. `sum()` over a `bigint` column returns `numeric`,
which the driver hands back as a string; every such column is cast `::text` and
parsed with `BigInt`, never `Number`. The item-sales extension is
`round(unit_price * qty)` in `numeric`, Postgres's exact decimal type, rounding
half away from zero — the same arithmetic `extend()` performs in
`packages/domain`. No float exists anywhere in the path.

**4. Top products is scaled against the leader, not against total sales.** The
bar behind each row is that item's net sales as a fraction of the top item's,
and no percentage is printed. A share of total would mean dividing line-level
net sales by an invoice total that also carries order-level discounts and
service charge; the percentage would be wrong in a way nobody could spot on a
card, which is the C3/V1 shape R16 exists to prevent. Ranking and the gap
between places is what the panel is read for, and that is all it claims.

**5. The comparison is the same weekday last week, and says so.** A restaurant
week is not flat. "Up 40% on yesterday" is a fact about Saturday following
Friday, not about the business. The gross-takings card compares today with the
same weekday seven days back and names the date it compared against, so the
claim being made is visible.

## Consequences

- One bug fixed on the way through. `readDashboard` summed the _five_ expense
  rows it had fetched for the preview list and called the result
  `expenseTotal`, so `operatingResult` overstated the day's profit from the
  sixth expense onward. Both figures now fold one full-day result.
- Four new figures on the screen — covers, average ticket, the weekday
  comparison, and the trend — and one removed.
- Five queries per load instead of four, all aggregates.
- `MONTH_ABBREVIATIONS` and `WEEKDAY_ABBREVIATIONS` are now exported from
  `apps/pos/components/lib/format.ts` rather than being inline in
  `formatBusinessDate`. No behaviour change.
- The trend is a flex row of sized elements, not an SVG and not a chart
  library. Nothing is added to the bundle of a screen opened dozens of times a
  shift, the bars inherit the theme tokens in both modes, and each bar is a
  real `<button>` so the detail readout is reachable by keyboard and announced
  in full.
- `lib/dashboard/trend.test.ts` asserts the bucketing against the calendar —
  the month-boundary week, the 31 January month walk, and the window edge.
  These fail silently on a chart otherwise: the axis still draws twelve bars,
  they are just the wrong twelve.

## Not done

- Top products is fixed to a trailing 30 days and does not follow the trend
  grain. Doing so needs a per-item, per-period aggregate; a 30-day window is
  the actionable answer for "what should I prep more of" at either grain.
- No period-over-period figure on `StatCard` itself. The comparison is rendered
  through the existing `caption` slot, so the design system keeps ADR 0020's
  position that a card has no trend affordance to fill with an unqueried
  number.
