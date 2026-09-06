import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@natech/ui';
import {
  MOCK_TABLES,
  MOCK_VIEWER_CASHIER,
  MOCK_VIEWER_WAITER,
  MOCK_ZONES,
  floorSummary,
  tableChips,
} from '@natech/contracts/mocks';
import { FloorPlan } from '@/components/floor/FloorPlan';
import { TableChipCard } from '@/components/floor/TableChipCard';

/**
 * `@/lib/floor/actions` is mocked the same way `test/floor-editor.test.tsx`
 * mocks it: the real file imports `lib/auth/session.ts`, which imports
 * `server-only`, and `server-only` throws unconditionally outside Next's own
 * bundler. `next/navigation`'s `useRouter` needs a stub too — there is no
 * `AppRouterContext` mounted under a plain `@testing-library/react` render —
 * and `@/lib/realtime/useFloorRealtime`'s live subscription is exactly what
 * §16's poll backstop exists to make unnecessary for a functional test.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/floor/actions', () => ({
  seatGuestsAction: vi.fn(async () => ({ ok: true, error: null })),
  markCleanAction: vi.fn(async () => ({ ok: true, error: null })),
  toggleBlockAction: vi.fn(async () => ({ ok: true, error: null })),
  transferTableAction: vi.fn(async () => ({ ok: true, error: null })),
  mergeTablesAction: vi.fn(async () => ({ ok: true, error: null })),
  splitTableAction: vi.fn(async () => ({ ok: true, error: null })),
}));
vi.mock('@/lib/realtime/useFloorRealtime', () => ({ useFloorRealtime: () => {} }));

/**
 * The floor plan — BUILD-PLAN.md §9.1, §9.2, §9.3, R13, R15, R16.
 *
 * The load-bearing assertion is the waiter one. §9.2 says to omit the money row
 * **entirely** for a `WAITER` rather than blur it, and the contract makes that
 * expressible by allowing `chip.money` to be null. A blurred figure is still a
 * figure on screen; an absent one is absent.
 */
function renderFloor(viewer = MOCK_VIEWER_CASHIER) {
  return render(
    <ToastProvider>
      <FloorPlan
        zones={MOCK_ZONES}
        tables={MOCK_TABLES}
        chips={tableChips(viewer)}
        viewer={viewer}
      />
    </ToastProvider>,
  );
}

/** The same physical table, seen by two roles. */
const MONIED_TABLE_ID = tableChips(MOCK_VIEWER_CASHIER).find(
  (chip) => chip.money !== null,
)?.tableId;

describe('the table chip', () => {
  it('has a table carrying money for a cashier to compare against', () => {
    expect(MONIED_TABLE_ID).toBeDefined();
  });

  it('renders no money at all for a waiter — §9.2', () => {
    const chip = tableChips(MOCK_VIEWER_WAITER).find((entry) => entry.tableId === MONIED_TABLE_ID);
    expect(chip).toBeDefined();

    const { container } = render(<TableChipCard chip={chip!} onOpen={() => {}} />);
    expect(container.querySelectorAll('[data-money]')).toHaveLength(0);
  });

  it('renders the money row for a cashier on that same table — §6.9', () => {
    const chip = tableChips(MOCK_VIEWER_CASHIER).find((entry) => entry.tableId === MONIED_TABLE_ID);
    expect(chip).toBeDefined();

    const { container } = render(<TableChipCard chip={chip!} onOpen={() => {}} />);
    expect(container.querySelectorAll('[data-money]').length).toBeGreaterThan(0);
  });

  it('pairs every state with an icon and a text label, never colour — R15', () => {
    for (const chip of tableChips(MOCK_VIEWER_CASHIER).slice(0, 8)) {
      const { container, unmount } = render(<TableChipCard chip={chip} onOpen={() => {}} />);
      expect(container.querySelector('svg')).not.toBeNull();
      expect((container.textContent ?? '').trim().length).toBeGreaterThan(0);
      unmount();
    }
  });
});

describe('the floor plan', () => {
  it('offers every zone plus an All Zones overview — §9.3', () => {
    renderFloor();
    const zoneGroup = screen.getByRole('group', { name: 'Zone' });
    expect(within(zoneGroup).getAllByRole('button')).toHaveLength(MOCK_ZONES.length + 1);
    expect(within(zoneGroup).getByRole('button', { name: /All zones/ })).toBeInTheDocument();
  });

  it('draws on the logical grid, never absolute pixels — §9.3', () => {
    const { container } = renderFloor();
    const plans = container.querySelectorAll('svg[role="group"]');
    expect(plans.length).toBe(MOCK_ZONES.length);
    for (const plan of plans) {
      expect(plan.getAttribute('viewBox')).toBe('0 0 40 24');
    }
  });

  it('derives the summary bar from the tables it heads — R16', () => {
    const { container } = renderFloor();
    const summary = floorSummary(tableChips(MOCK_VIEWER_CASHIER));

    const bar = container.querySelector('dl');
    expect(bar).not.toBeNull();
    const free = within(bar as HTMLElement).getByText('Free').parentElement;
    expect(within(free as HTMLElement).getByText(String(summary.free))).toBeInTheDocument();

    const covers = within(bar as HTMLElement).getByText('Covers seated').parentElement;
    expect(
      within(covers as HTMLElement).getByText(String(summary.coversSeated)),
    ).toBeInTheDocument();
  });

  it('never renders a negative duration — R13, defect V2', () => {
    const { container } = renderFloor();
    expect(container.textContent ?? '').not.toMatch(/-\d\d:\d\d/);
  });
});
