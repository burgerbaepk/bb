import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Money } from './money/Money';
import { Duration } from './duration/Duration';
import { StatusPill, TABLE_STATE_PRESETS, type TableState } from './status/StatusPill';
import { StatCard } from './stat/StatCard';
import { DataTable } from './table/DataTable';
import { OfflineBanner } from './feedback/OfflineBanner';

describe('Money — R1', () => {
  it('renders bigint paisa as the printed figure', () => {
    render(<Money value={1380960n} symbol="Rs." />);
    expect(screen.getByText('Rs. 13,809.60')).toBeInTheDocument();
  });

  it('marks itself so a component test can assert its presence or absence', () => {
    const { container } = render(<Money value={100n} />);
    const node = container.querySelector('[data-money]');
    expect(node).not.toBeNull();
    // The exact paisa value travels with the node, so an assertion never has to
    // parse a formatted string back into a number.
    expect(node?.getAttribute('data-paisa')).toBe('100');
  });

  it('pins money to LTR so Western digits survive an RTL paragraph (§15.2)', () => {
    const { container } = render(<Money value={1222000n} />);
    expect(container.querySelector('[data-money]')?.getAttribute('dir')).toBe('ltr');
  });
});

describe('Duration — R13', () => {
  it('renders zero rather than a negative (defect V2)', () => {
    render(<Duration seconds={-500} />);
    expect(screen.getByText('00:00')).toBeInTheDocument();
    expect(screen.queryByText(/-/)).toBeNull();
  });

  it('carries an icon and a state word alongside the colour (R15)', () => {
    const { container } = render(
      <Duration seconds={900} thresholds={{ targetSeconds: 300, overdueSeconds: 600 }} />,
    );
    expect(container.querySelector('svg')).not.toBeNull();
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });
});

describe('StatusPill — R15', () => {
  it('renders both a label and an icon', () => {
    const preset = TABLE_STATE_PRESETS.ORDERED;
    const { container } = render(<StatusPill label={preset.label} icon={preset.icon} />);
    expect(screen.getByText('Ordered')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it.each(Object.keys(TABLE_STATE_PRESETS) as TableState[])(
    'table state %s carries a label and an icon',
    (state) => {
      const preset = TABLE_STATE_PRESETS[state];
      expect(preset.label.length).toBeGreaterThan(0);
      // A lucide icon is a forwardRef object, not a plain function; the render
      // below is the assertion that matters.
      expect(preset.icon).toBeDefined();

      const { container } = render(
        <StatusPill label={preset.label} icon={preset.icon} tone={preset.tone} />,
      );
      expect(screen.getByText(preset.label)).toBeInTheDocument();
      expect(container.querySelector('svg')).not.toBeNull();
    },
  );

  it('covers every §9.1 table state', () => {
    expect(Object.keys(TABLE_STATE_PRESETS)).toEqual([
      'FREE',
      'RESERVED',
      'SEATED',
      'ORDERED',
      'SERVED',
      'PAYING',
      'CLEANING',
      'BLOCKED',
    ]);
  });
});

interface Row {
  readonly id: string;
  readonly table: string;
  readonly total: bigint;
}

const ROWS: readonly Row[] = [
  { id: '1', table: '17', total: 731000n },
  { id: '2', table: '4', total: 212000n },
  { id: '3', table: '9', total: 61100n },
];

describe('StatCard — ADR 0020', () => {
  it('renders a <Money> value rather than a formatted string (R1)', () => {
    const { container } = render(
      <StatCard label="Gross takings" value={<Money value={4837650n} symbol="Rs." />} />,
    );
    expect(screen.getByText('Gross takings')).toBeInTheDocument();
    // The paisa travel with the node, so the figure on the card is the figure
    // the caller was handed, not one this component re-derived.
    expect(container.querySelector('[data-money]')?.getAttribute('data-paisa')).toBe('4837650');
  });

  it('emits nothing for the optional slots rather than an empty element', () => {
    const { container } = render(<StatCard label="Live orders" value={7} />);
    expect(container.querySelectorAll('p')).toHaveLength(2);
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('DataTable — R16', () => {
  it('derives the header summary from the rows it renders', () => {
    // C3 and V1: a header that disagrees with its list. The summary here is a
    // function of the same array, so the two cannot diverge.
    render(
      <DataTable
        rows={ROWS}
        getRowId={(row) => row.id}
        columns={[
          { key: 'table', header: 'Table', render: (row) => row.table },
          {
            key: 'total',
            header: 'Subtotal',
            numeric: true,
            render: (row) => <Money value={row.total} />,
          },
        ]}
        summary={(rows) => (
          <span>
            {rows.length} orders ·{' '}
            <Money value={rows.reduce((sum, row) => sum + row.total, 0n)} symbol="Rs." />
          </span>
        )}
      />,
    );

    expect(screen.getByText(/3 orders/)).toBeInTheDocument();
    expect(screen.getByText('Rs. 10,041.00')).toBeInTheDocument();
  });

  it('shows an empty state rather than an empty frame (§19)', () => {
    render(
      <DataTable
        rows={[]}
        getRowId={(row: Row) => row.id}
        columns={[{ key: 'table', header: 'Table', render: (row) => row.table }]}
        emptyTitle="No open orders"
      />,
    );
    expect(screen.getByText('No open orders')).toBeInTheDocument();
  });

  it('shows a loading state (§19)', () => {
    render(
      <DataTable
        rows={[]}
        loading
        getRowId={(row: Row) => row.id}
        columns={[{ key: 'table', header: 'Table', render: (row) => row.table }]}
        caption="Open orders"
      />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('OfflineBanner — §8', () => {
  it('reports the real queue depth rather than a vague state', () => {
    render(<OfflineBanner queuedOrders={7} secondsSinceLastSync={125} />);
    expect(screen.getByText('7 orders queued')).toBeInTheDocument();
    expect(screen.getByText('02:05')).toBeInTheDocument();
  });

  it('escalates past 200 queued orders but keeps accepting them', () => {
    render(<OfflineBanner queuedOrders={201} secondsSinceLastSync={60} />);
    expect(screen.getByText(/Orders are still being accepted/)).toBeInTheDocument();
  });

  it('escalates past six hours offline', () => {
    render(<OfflineBanner queuedOrders={1} secondsSinceLastSync={6 * 60 * 60} />);
    expect(screen.getByText(/Orders are still being accepted/)).toBeInTheDocument();
  });

  it('singularises one order', () => {
    render(<OfflineBanner queuedOrders={1} secondsSinceLastSync={10} />);
    expect(screen.getByText('1 order queued')).toBeInTheDocument();
  });
});
