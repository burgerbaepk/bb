'use client';

import { useEffect, useState } from 'react';
import { CircleDollarSign, Printer as DsPrinter, ReceiptText, ShoppingBag } from 'lucide-react';
import {
  Button as DsButton,
  IconButton as DsIconButton,
  SegmentedControl as DsSegmented,
  SelectField as DsSelectField,
  Switch as DsSwitch,
  TextField as DsTextField,
  DataTable,
  Dialog,
  Duration,
  EmptyState,
  ErrorState,
  LoadingState,
  Money,
  NumericKeypad,
  OfflineBanner,
  Sheet,
  StatCard,
  StatusPill,
  TABLE_STATE_PRESETS,
  ToastProvider,
  useToast,
  type TableState,
} from '@natech/ui';

/**
 * `/_ds` — every primitive in every state. BUILD-PLAN.md §18 (M01 gate).
 *
 * The gate is *"no hardcoded hex in source. RTL toggle produces no layout
 * breakage. `Duration` cannot render a negative value."* The theme and
 * direction toggles here are how the second one is reviewed by eye; the
 * `natech/no-physical-direction` lint rule is how it is enforced.
 *
 * Every value on this page is a literal. Nothing here fetches.
 */

type Theme = 'light' | 'dark';
type Direction = 'ltr' | 'rtl';

export function DesignSystem() {
  const [theme, setTheme] = useState<Theme>('light');
  const [direction, setDirection] = useState<Direction>('ltr');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('dir', direction);
    // The Urdu samples below carry lang="ur" themselves; the page language only
    // changes when the whole direction flips.
    document.documentElement.setAttribute('lang', direction === 'rtl' ? 'ur' : 'en');
    return () => {
      document.documentElement.setAttribute('dir', 'ltr');
      document.documentElement.setAttribute('lang', 'en');
    };
  }, [direction]);

  return (
    <ToastProvider>
      <div className="bg-surface text-ink min-h-dvh">
        <Controls
          theme={theme}
          direction={direction}
          onTheme={setTheme}
          onDirection={setDirection}
        />
        <main className="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-10">
          <ControlsSection />
          <FormSection />
          <MoneySection />
          <DurationSection />
          <StatusSection />
          <StatSection />
          <TableSection />
          <OverlaySection />
          <KeypadSection />
          <StateSection />
          <TypographySection />
        </main>
      </div>
    </ToastProvider>
  );
}

function Controls({
  theme,
  direction,
  onTheme,
  onDirection,
}: {
  theme: Theme;
  direction: Direction;
  onTheme: (value: Theme) => void;
  onDirection: (value: Direction) => void;
}) {
  return (
    <header className="border-border bg-surface-raised sticky top-0 z-40 flex flex-wrap items-center gap-4 border-b px-6 py-3">
      <h1 className="text-lg font-semibold">Design system</h1>
      <div className="flex gap-2">
        <Toggle active={theme === 'light'} onClick={() => onTheme('light')}>
          Light
        </Toggle>
        <Toggle active={theme === 'dark'} onClick={() => onTheme('dark')}>
          Dark
        </Toggle>
      </div>
      <div className="flex gap-2">
        <Toggle active={direction === 'ltr'} onClick={() => onDirection('ltr')}>
          LTR
        </Toggle>
        <Toggle active={direction === 'rtl'} onClick={() => onDirection('rtl')}>
          RTL
        </Toggle>
      </div>
      <p className="text-ink-muted text-sm">M01 · every primitive, every state</p>
    </header>
  );
}

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? 'bg-primary text-primary-ink rounded-md px-3 py-1.5 text-sm font-medium'
          : 'border-border text-ink-muted hover:text-ink rounded-md border px-3 py-1.5 text-sm'
      }
    >
      {children}
    </button>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        {note !== undefined && <p className="text-ink-muted text-sm">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-border flex flex-wrap items-center gap-4 border-b py-2 last:border-b-0">
      <span className="text-ink-muted w-56 shrink-0 text-sm">{label}</span>
      {children}
    </div>
  );
}

function MoneySection() {
  return (
    <Section
      title="Money"
      note="R1 — bigint paisa in, formatted string out. No float anywhere in the path. Appendix A.1 figures."
    >
      <Row label="Grand total">
        <Money value={1380960n} symbol="Rs." emphasis="strong" />
      </Row>
      <Row label="Total ex tax">
        <Money value={1222000n} />
      </Row>
      <Row label="Sales tax at 8 percent">
        <Money value={97760n} />
      </Row>
      <Row label="POS service fee">
        <Money value={100n} />
      </Row>
      <Row label="Zero">
        <Money value={0n} />
      </Row>
      <Row label="One paisa">
        <Money value={1n} />
      </Row>
      <Row label="Negative, credit note">
        <Money value={-1380960n} symbol="Rs." parenthesiseNegative />
      </Row>
      <Row label="Muted">
        <Money value={61100n} emphasis="muted" />
      </Row>
      <Row label="Beyond MAX_SAFE_INTEGER">
        <Money value={9007199254740993n} />
      </Row>
    </Section>
  );
}

const THRESHOLDS = { targetSeconds: 300, warnSeconds: 480, overdueSeconds: 600 };

function DurationSection() {
  return (
    <Section
      title="Duration"
      note="R13 — a negative cannot be rendered. Defect V2 was -08:20 in red on the kitchen display."
    >
      <Row label="Plain, under an hour">
        <Duration seconds={1450} />
      </Row>
      <Row label="Plain, over an hour">
        <Duration seconds={3840} />
      </Row>
      <Row label="Negative input">
        <Duration seconds={-500} />
      </Row>
      <Row label="NaN input">
        <Duration seconds={Number.NaN} />
      </Row>
      <Row label="OK band">
        <Duration seconds={120} thresholds={THRESHOLDS} showStateLabel />
      </Row>
      <Row label="WARN band">
        <Duration seconds={420} thresholds={THRESHOLDS} showStateLabel />
      </Row>
      <Row label="OVERDUE band">
        <Duration seconds={1360} thresholds={THRESHOLDS} showStateLabel />
      </Row>
    </Section>
  );
}

function StatusSection() {
  const states = Object.keys(TABLE_STATE_PRESETS) as TableState[];
  return (
    <Section
      title="StatusPill"
      note="R15 — icon and label are required props. A colour-only state cannot be constructed."
    >
      <div className="flex flex-wrap gap-2">
        {states.map((state) => {
          const preset = TABLE_STATE_PRESETS[state];
          return (
            <StatusPill
              key={state}
              label={preset.label}
              icon={preset.icon}
              tone={preset.tone}
              outline={preset.outline}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {states.slice(0, 4).map((state) => {
          const preset = TABLE_STATE_PRESETS[state];
          return (
            <StatusPill
              key={state}
              size="sm"
              label={preset.label}
              icon={preset.icon}
              tone={preset.tone}
              outline={preset.outline}
            />
          );
        })}
      </div>
    </Section>
  );
}

function StatSection() {
  return (
    <Section
      title="StatCard"
      note="ADR 0020 — one headline figure, one card. `value` is a node so money arrives as <Money>, never as a string the caller formatted (R1)."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={CircleDollarSign}
          label="Gross takings"
          value={<Money value={4837650n} symbol="Rs." />}
          caption="Finalized invoices, today"
        />
        <StatCard
          icon={ReceiptText}
          label="Invoices"
          value={128}
          caption="Tax invoices issued today"
        />
        <StatCard icon={ShoppingBag} label="Live orders" value={7} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="No icon, no caption" value={<Money value={73100n} symbol="Rs." />} />
        <StatCard
          label="With an action"
          value={<Money value={212000n} symbol="Rs." />}
          caption="An action slot takes a pill or a link affordance."
          action={<StatusPill size="sm" label="Ordered" icon={TABLE_STATE_PRESETS.ORDERED.icon} />}
        />
      </div>
    </Section>
  );
}

interface OrderRow {
  readonly id: string;
  readonly table: string;
  readonly waiter: string;
  readonly subtotal: bigint;
  readonly elapsed: number;
}

const ORDERS: readonly OrderRow[] = [
  { id: '1', table: '17', waiter: 'AK', subtotal: 731000n, elapsed: 1450 },
  { id: '2', table: '4', waiter: 'MS', subtotal: 212000n, elapsed: 320 },
  { id: '3', table: '9', waiter: 'AK', subtotal: 61100n, elapsed: 95 },
];

function TableSection() {
  return (
    <Section
      title="DataTable"
      note="R16 — the header summary is a function of the rows rendered, so it cannot disagree with the list."
    >
      <DataTable
        rows={ORDERS}
        getRowId={(row) => row.id}
        caption="Open orders"
        columns={[
          { key: 'table', header: 'Table', render: (row) => row.table },
          { key: 'waiter', header: 'Waiter', secondary: true, render: (row) => row.waiter },
          {
            key: 'elapsed',
            header: 'Dwell',
            render: (row) => <Duration seconds={row.elapsed} thresholds={THRESHOLDS} />,
          },
          {
            key: 'subtotal',
            header: 'Subtotal ex tax',
            numeric: true,
            render: (row) => <Money value={row.subtotal} />,
          },
        ]}
        summary={(rows) => (
          <span className="flex flex-wrap items-center gap-2">
            {rows.length} open orders
            <span aria-hidden="true">·</span>
            <Money value={rows.reduce((sum, row) => sum + row.subtotal, 0n)} symbol="Rs." />
          </span>
        )}
      />

      <p className="text-ink-muted text-sm">Empty and loading:</p>
      <DataTable
        rows={[]}
        getRowId={(row: OrderRow) => row.id}
        columns={[{ key: 'table', header: 'Table', render: (row) => row.table }]}
        emptyTitle="No open orders"
        emptyDescription="Orders appear here as soon as a table is seated."
      />
      <DataTable
        rows={[]}
        loading
        caption="Open orders"
        getRowId={(row: OrderRow) => row.id}
        columns={[{ key: 'table', header: 'Table', render: (row) => row.table }]}
      />
    </Section>
  );
}

function OverlaySection() {
  const [dialog, setDialog] = useState(false);
  const [mandatory, setMandatory] = useState(false);
  const [sheetEnd, setSheetEnd] = useState(false);
  const [sheetBottom, setSheetBottom] = useState(false);
  const { show } = useToast();

  return (
    <Section
      title="Dialog, Sheet, Toast"
      note="Native dialog element: focus trap, Escape, top layer. Sheet sides are logical, so they flip with direction."
    >
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setDialog(true)}>Open dialog</Button>
        <Button onClick={() => setMandatory(true)}>Mandatory dialog</Button>
        <Button onClick={() => setSheetEnd(true)}>Sheet, inline end</Button>
        <Button onClick={() => setSheetBottom(true)}>Sheet, bottom</Button>
        <Button onClick={() => show('info', 'Table 17 marked clean.')}>Toast info</Button>
        <Button onClick={() => show('success', 'Invoice INV-000482 finalized.')}>
          Toast success
        </Button>
        <Button onClick={() => show('error', 'Card authorization timed out. Please retry.')}>
          Toast error
        </Button>
      </div>

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="Void order #20390"
        description="This is logged as an exception and reported in the Z report."
        footer={
          <>
            <Button onClick={() => setDialog(false)}>Cancel</Button>
            <Button primary onClick={() => setDialog(false)}>
              Void order
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Voiding an order requires a reason code and a supervisor PIN (§11.3).
        </p>
      </Dialog>

      {/* §12 — the shift-close variance dialog. A decision that must be made,
          so Escape and the backdrop are inert. */}
      <Dialog
        open={mandatory}
        mandatory
        onClose={() => setMandatory(false)}
        title="Counted cash does not match expected"
        footer={
          <>
            <Button onClick={() => setMandatory(false)}>Recount</Button>
            <Button primary onClick={() => setMandatory(false)}>
              Close shift anyway
            </Button>
          </>
        }
      >
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt>Expected cash</dt>
            <dd>
              <Money value={1380960n} symbol="Rs." />
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Counted cash</dt>
            <dd>
              <Money value={1478720n} symbol="Rs." emphasis="strong" />
            </dd>
          </div>
          <div className="border-border flex justify-between gap-4 border-t pt-1">
            <dt>Variance</dt>
            <dd>
              <Money value={97760n} symbol="Rs." />
            </dd>
          </div>
        </dl>
      </Dialog>

      <Sheet
        open={sheetEnd}
        onClose={() => setSheetEnd(false)}
        title="Table 17"
        description="Ground · 4 guests · Waiter AK"
        side="inline-end"
        footer={
          <Button primary onClick={() => setSheetEnd(false)}>
            Take payment
          </Button>
        }
      >
        <p className="text-sm">
          The floor plan opens this on tap (§9.3). Anchored to the trailing edge, so it is on the
          right in English and the left in Urdu.
        </p>
      </Sheet>

      <Sheet
        open={sheetBottom}
        onClose={() => setSheetBottom(false)}
        title="Your order"
        side="bottom"
        footer={
          <Button primary onClick={() => setSheetBottom(false)}>
            Place order
          </Button>
        }
      >
        <p className="text-sm">The storefront cart sheet (§13.4).</p>
      </Sheet>
    </Section>
  );
}

function Button({
  children,
  onClick,
  primary = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        primary
          ? 'bg-primary text-primary-ink hover:bg-primary-hover min-h-(--spacing-touch) rounded-md px-4 py-2 text-sm font-medium'
          : 'border-border hover:bg-surface-sunken min-h-(--spacing-touch) rounded-md border px-4 py-2 text-sm'
      }
    >
      {children}
    </button>
  );
}

function KeypadSection() {
  const [pin, setPin] = useState('');
  const [amount, setAmount] = useState('');
  return (
    <Section
      title="NumericKeypad"
      note="§14.2 staff PIN, and paisa-first amount entry. Digits go straight to bigint, never through a number."
    >
      <div className="flex flex-wrap gap-8">
        <NumericKeypad mode="pin" value={pin} onChange={setPin} label="Staff PIN" />
        <NumericKeypad mode="amount" value={amount} onChange={setAmount} label="Amount tendered" />
      </div>
    </Section>
  );
}

function StateSection() {
  return (
    <Section
      title="Empty, error, loading, offline"
      note="§19 — all four are required on every surface."
    >
      <EmptyState
        title="No exceptions in this range"
        description="Voids, discounts, price overrides, and declined card attempts appear here (§17)."
      />
      <ErrorState
        title="Could not reach the payment provider"
        description="No charge was recorded. Check the connection and try again."
        detail="RETRYABLE · provider timeout after 1200ms"
      />
      <LoadingState label="Loading open orders" />
      <div className="border-border overflow-hidden rounded-lg border">
        <OfflineBanner queuedOrders={7} secondsSinceLastSync={125} />
      </div>
      <div className="border-border overflow-hidden rounded-lg border">
        <OfflineBanner queuedOrders={214} secondsSinceLastSync={22_000} />
      </div>
    </Section>
  );
}

function TypographySection() {
  return (
    <Section
      title="Typography"
      note="§15.2 — Nastaliq at line-height 2, never uppercased or letter-spaced, 18px minimum. Money stays Western digits in both directions."
    >
      <Row label="Display">
        <span className="font-display text-2xl">Special Mutton Champ</span>
      </Row>
      <Row label="Body">
        <span className="text-base">Mutton Gola Kabab, 5 pieces</span>
      </Row>
      <Row label="Mono">
        <span className="font-mono text-sm">INV-000482</span>
      </Row>
      <Row label="Urdu, item name">
        <span lang="ur" className="font-urdu">
          مٹن گولا کباب
        </span>
      </Row>
      <Row label="Urdu with money">
        <span lang="ur" className="font-urdu">
          کل رقم <Money value={1380960n} symbol="Rs." />
        </span>
      </Row>
      <Row label="KDS scale">
        <span className="text-kds font-semibold tabular-nums">20390</span>
      </Row>
    </Section>
  );
}

/**
 * M04 added five primitives that M01 did not name — BUILD-PLAN.md §18 M04.
 *
 * Three apps assembling Phase 1 screens without a button would have produced
 * three button implementations and three answers to what a destructive action
 * looks like. They are reviewed here on the same terms as the M01 set: every
 * variant, both themes, both text directions.
 */
function ControlsSection() {
  return (
    <Section
      title="Actions"
      note="Added in M04. `danger` exists so a void or a refund reads as destructive — §11.3 keeps it out of the primary row regardless."
    >
      <Row label="Tones">
        <DsButton tone="primary">Take payment</DsButton>
        <DsButton>Refresh</DsButton>
        <DsButton tone="ghost">Cancel</DsButton>
        <DsButton tone="danger">Void order</DsButton>
      </Row>
      <Row label="Sizes, 44px minimum">
        <DsButton size="sm">Small</DsButton>
        <DsButton size="md">Medium</DsButton>
        <DsButton size="lg">Large</DsButton>
      </Row>
      <Row label="With an icon">
        <DsButton tone="primary" icon={DsPrinter}>
          Print
        </DsButton>
        <DsIconButton icon={DsPrinter} label="Print the invoice" />
      </Row>
      <Row label="Disabled">
        <DsButton tone="primary" disabled>
          Take payment
        </DsButton>
      </Row>
    </Section>
  );
}

function FormSection() {
  const [text, setText] = useState('INV-000482');
  const [choice, setChoice] = useState('BRIDGE_AGENT');
  const [on, setOn] = useState(true);
  const [segment, setSegment] = useState('ALL');

  return (
    <Section
      title="Forms and filters"
      note="R15 — the switch carries a tick or a cross and its state as a word. About one man in twelve cannot separate the on colour from the off one."
    >
      <Row label="Chips, §11.2">
        <DsSegmented
          label="Filter by channel"
          value={segment}
          onChange={setSegment}
          options={[
            { value: 'ALL', label: 'All', count: 4 },
            { value: 'POS', label: 'Dine-in', count: 4 },
            { value: 'WEB', label: 'Web', count: 0 },
            { value: 'PHONE', label: 'Phone', count: 0 },
          ]}
        />
      </Row>
      <Row label="Text field">
        <DsTextField
          label="Invoice number"
          help="Gap-free, monotonic, never resets, never reused."
          value={text}
          onChange={(event) => setText(event.target.value)}
          tabular
        />
      </Row>
      <Row label="Select">
        <DsSelectField
          label="Print path"
          help="Per terminal. The bridge agent owns the queue and offline buffering."
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
          options={[
            { value: 'BRIDGE_AGENT', label: 'Print bridge agent' },
            { value: 'WEB_USB', label: 'WebUSB / WebSerial' },
            { value: 'HTML_DIALOG', label: '80mm HTML print dialog' },
          ]}
        />
      </Row>
      <Row label="Field in error">
        <DsTextField
          label="NTN"
          error="An NTN is seven digits, a hyphen, and a check digit."
          value="12345"
          onChange={() => {}}
        />
      </Row>
      <Row label="Switch">
        <DsSwitch checked={on} onChange={setOn} label="Bilingual receipts" />
      </Row>
    </Section>
  );
}
