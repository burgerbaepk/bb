import Link from 'next/link';
import {
  ArrowUpRight,
  CircleDollarSign,
  ClipboardList,
  Receipt,
  ReceiptText,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { Money, StatCard } from '@natech/ui';
import { PageHeading } from '@/components/admin/PageHeading';
import { SalesTrend } from '@/components/admin/SalesTrend';
import { TopItems } from '@/components/admin/TopItems';
import { formatBusinessDate } from '@/components/lib/format';
import { requirePermissionPage } from '@/lib/auth/session';
import { readCurrentBusinessDate } from '@/lib/outlet/queries';
import { TOP_ITEM_DAYS, readDashboard } from '@/lib/dashboard/queries';

/**
 * The back office dashboard — BUILD-PLAN.md §14.2, §17; ADR 0020, ADR 0023.
 *
 * Read top to bottom this answers, in order, the four questions a restaurant
 * manager opens it to ask: did we make money today, how did today trade, is
 * that better or worse than usual, and what is selling. Nothing else earns a
 * place above the fold.
 *
 * There is no tax card (ADR 0023). Tax is authoritative only at finalize (R9)
 * and is a statutory question, not an operating one; it has its own report and
 * its own compliance screen, and putting a slice of it here invited reading a
 * live figure as a return.
 */
export default async function Page() {
  await requirePermissionPage('reports.read');
  const businessDate = await readCurrentBusinessDate();
  const data = await readDashboard(businessDate);
  const dateLabel = formatBusinessDate(businessDate);

  return (
    <div className="space-y-4">
      <PageHeading
        title="Dashboard"
        note={`Live operating picture for ${dateLabel}. Finalized sales and recorded expenses only.`}
      />

      {/* ADR 0020 — the lead figure is a card like every other card, not a
          gradient panel. A gradient is a second thing competing for the eye
          with the number printed on it, and the one figure a manager opens this
          screen for is the number. */}
      <section className="border-border bg-surface-raised rounded-base border p-5 md:p-6">
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-end">
          <div>
            <p className="text-ink-muted text-sm font-medium">Operating result today</p>
            <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums md:text-5xl">
              <Money value={data.operatingResult} symbol="Rs." />
            </p>
            <p className="text-ink-muted mt-3 max-w-prose text-sm">
              Net sales less recorded operating expenses. An operational indicator, not an
              accounting profit statement.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Mini label="Net sales" value={data.today.netSales} />
            <Mini label="Expenses" value={data.expenseTotal} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={CircleDollarSign}
          label="Gross takings"
          value={<Money value={data.today.grossTakings} symbol="Rs." />}
          caption={
            <Comparison
              today={data.today.grossTakings}
              previous={data.comparison?.grossTakings ?? null}
              previousDate={data.comparisonDate}
            />
          }
          href="/admin/reports/sales"
        />
        <Metric
          icon={ReceiptText}
          label="Invoices"
          value={data.today.invoiceCount}
          caption={`Tax invoices issued on ${dateLabel}`}
          href="/admin/invoices"
        />
        <Metric
          icon={Receipt}
          label="Average ticket"
          value={<Money value={data.averageTicket} symbol="Rs." />}
          caption={
            data.today.covers === 0 ? (
              'Gross takings per invoice'
            ) : (
              <>Per invoice · {data.today.covers} covers today</>
            )
          }
          href="/admin/reports/sales"
        />
        <Metric
          icon={ShoppingBag}
          label="Live orders"
          value={data.liveOrderCount}
          caption="Placed or served, not yet paid"
          href="/"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <SalesTrend businessDate={data.businessDate} series={data.series} />
        <TopItems rows={data.topItems} days={TOP_ITEM_DAYS} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="border-border bg-surface-raised rounded-base border p-5">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold tracking-tight">Latest expenses</h2>
              <p className="text-ink-muted text-sm">
                {data.expenseCount === 0
                  ? 'Most recent costs recorded today.'
                  : `${data.expenseCount} recorded today, most recent first.`}
              </p>
            </div>
            <Link
              href="/admin/expenses"
              className="text-ink-muted hover:text-ink flex shrink-0 items-center gap-1 text-sm font-medium"
            >
              Open ledger <ArrowUpRight className="size-4" />
            </Link>
          </div>
          {data.recentExpenses.length === 0 ? (
            <Empty text="No expenses recorded today." />
          ) : (
            <ul className="divide-border divide-y">
              {data.recentExpenses.map((row) => (
                <li key={row.id} className="flex items-center gap-3 py-3">
                  <span className="bg-surface-sunken text-ink-muted flex size-9 shrink-0 items-center justify-center rounded-full">
                    <ClipboardList aria-hidden="true" className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.description}</p>
                    <p className="text-ink-subtle text-xs">{row.category}</p>
                  </div>
                  <Money value={row.amount} emphasis="strong" />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-border bg-surface-raised rounded-base border p-5">
          <h2 className="font-semibold tracking-tight">Service status</h2>
          <div className="divide-border mt-2 divide-y">
            <Status
              label="Register shift"
              value={data.shiftOpenedAt ? 'Open' : 'Closed'}
              ok={data.shiftOpenedAt !== null}
            />
            <Status
              label="Orders requiring service"
              value={String(data.liveOrderCount)}
              ok={data.liveOrderCount === 0}
            />
            <Status label="Business date" value={dateLabel} ok />
          </div>
        </div>
      </section>
    </div>
  );
}
function Mini({ label, value }: { readonly label: string; readonly value: bigint }) {
  return (
    <div className="border-border bg-surface rounded-base border p-3">
      <p className="text-ink-muted text-xs">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">
        <Money value={value} symbol="Rs." />
      </p>
    </div>
  );
}

/**
 * Today against the same weekday a week ago — not against yesterday.
 *
 * A restaurant week is not flat. Saturday beats Friday almost everywhere, so
 * "up 40% on yesterday" is a fact about the calendar, not about the business,
 * and a manager who learns that reads the arrow and stops. The comparison day
 * is named in the caption so the reader can see which claim is being made.
 *
 * Integer arithmetic throughout, on the same `bigint` paisa the figure above it
 * renders (R1). A percentage is not money, but `Number(a) / Number(b)` on two
 * paisa totals is how a float gets into the money path in the first place.
 */
function Comparison({
  today,
  previous,
  previousDate,
}: {
  readonly today: bigint;
  readonly previous: bigint | null;
  readonly previousDate: string;
}) {
  if (previous === null || previous === 0n) {
    return <>No trade on {formatBusinessDate(previousDate)} to compare</>;
  }
  const deltaTenths = Number(((today - previous) * 1000n) / previous);
  const up = deltaTenths >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={
        up ? 'text-ok inline-flex items-center gap-1' : 'text-warn inline-flex items-center gap-1'
      }
    >
      <Icon aria-hidden="true" className="size-3.5" />
      <span className="tabular-nums">
        {up ? '+' : '−'}
        {Math.abs(Math.round(deltaTenths / 10))}%
      </span>
      <span className="text-ink-subtle">vs {formatBusinessDate(previousDate)}</span>
    </span>
  );
}

/**
 * A `StatCard` that is also a link. The design system deliberately does not
 * import a router, so the anchor is here and the card picks the hover up
 * through `group-hover`.
 */
function Metric({
  icon,
  label,
  value,
  caption,
  href,
}: {
  readonly icon: typeof CircleDollarSign;
  readonly label: string;
  readonly value: React.ReactNode;
  readonly caption: React.ReactNode;
  readonly href: string;
}) {
  return (
    <Link href={href} className="rounded-base group block">
      <StatCard
        icon={icon}
        label={label}
        value={value}
        caption={caption}
        action={
          <ArrowUpRight
            aria-hidden="true"
            className="text-ink-subtle group-hover:text-ink size-4 transition-colors"
          />
        }
      />
    </Link>
  );
}
function Empty({ text }: { readonly text: string }) {
  return <p className="text-ink-muted bg-surface rounded-base p-5 text-center text-sm">{text}</p>;
}
function Status({
  label,
  value,
  ok,
}: {
  readonly label: string;
  readonly value: string;
  readonly ok: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-ink-muted text-sm">{label}</span>
      <span className={ok ? 'text-ok text-sm font-semibold' : 'text-warn text-sm font-semibold'}>
        {value}
      </span>
    </div>
  );
}
