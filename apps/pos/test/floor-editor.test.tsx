import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@natech/ui';
import { MOCK_TABLES, MOCK_ZONES } from '@natech/contracts/mocks';
import { FloorEditor } from '@/components/admin/FloorEditor';

/**
 * §9.3, §9.4 — the editor works in grid units and guards unsaved work.
 *
 * The pixel question is the one worth pinning. A plan traced on a wide monitor
 * and persisted in pixels is unreadable on the 768px tablet service actually
 * uses, so every coordinate that leaves this screen is a cell index.
 *
 * `@/lib/floor/actions` is mocked the same way `test/setup.ts` mocks the §14.2
 * action modules: the real file imports `lib/auth/session.ts`, which imports
 * `server-only`, and `server-only` throws unconditionally outside Next's own
 * bundler. None of these tests exercise persistence — that is
 * `lib/floor/bounds.test.ts` and a live check per the M08 runfile — so a stub
 * is enough to let `FloorEditor` import cleanly.
 */
vi.mock('@/lib/floor/actions', () => ({
  FLOOR_IDLE: { error: null, message: null },
  createZoneAction: vi.fn(async () => ({ error: null, message: null })),
  requestZoneBackgroundUploadAction: vi.fn(async () => ({ error: null, upload: null })),
  setZoneBackgroundAction: vi.fn(async () => ({ error: null, message: null })),
  saveFloorLayoutAction: vi.fn(async () => ({ error: null, message: null })),
}));

function renderEditor() {
  return render(
    <ToastProvider>
      <FloorEditor zones={MOCK_ZONES} tables={MOCK_TABLES} backgroundUrls={{}} />
    </ToastProvider>,
  );
}

function geometryOf(container: HTMLElement, code: string): number[] {
  const node = container.querySelector(`[data-table-code="${code}"]`);
  return (node?.getAttribute('data-geometry') ?? '').split(',').map((part) => Number(part));
}

describe('the floor plan editor', () => {
  it('draws on the logical grid, not on pixels — §9.3', () => {
    const { container } = renderEditor();
    const canvas = container.querySelector('svg[role="application"]');
    expect(canvas?.getAttribute('viewBox')).toBe('0 0 40 24');
  });

  it('keeps every persisted coordinate an integer cell index', () => {
    const { container } = renderEditor();
    const codes = MOCK_TABLES.filter((table) => table.zoneId === MOCK_ZONES[0]?.id).map(
      (table) => table.code,
    );

    for (const code of codes) {
      for (const value of geometryOf(container, code)) {
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });

  it('rotates in 45-degree steps — §9.4', async () => {
    const user = userEvent.setup({ delay: null });
    const { container } = renderEditor();

    const firstTable = MOCK_TABLES.find((table) => table.zoneId === MOCK_ZONES[0]?.id);
    expect(firstTable).toBeDefined();

    await user.click(screen.getByRole('button', { name: `Table ${firstTable?.code ?? ''}` }));
    await user.click(screen.getByRole('button', { name: /Rotate 45/ }));

    const [, , , , rotation] = geometryOf(container, firstTable?.code ?? '');
    expect(rotation).toBe((firstTable?.geometry.rotation ?? 0) + 45);
  });

  it('guards unsaved changes — §9.4', async () => {
    const user = userEvent.setup({ delay: null });
    renderEditor();

    expect(screen.queryByText(/Unsaved changes/)).toBeNull();
    expect(screen.getByRole('button', { name: /Save layout/ })).toBeDisabled();

    const firstTable = MOCK_TABLES.find((table) => table.zoneId === MOCK_ZONES[0]?.id);
    await user.click(screen.getByRole('button', { name: `Table ${firstTable?.code ?? ''}` }));
    await user.click(screen.getByRole('button', { name: /Rotate 45/ }));

    expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Save layout/ })).toBeEnabled();
  });

  it('offers every zone', () => {
    renderEditor();
    const group = screen.getByRole('group', { name: 'Zone' });
    expect(within(group).getAllByRole('button')).toHaveLength(MOCK_ZONES.length);
  });

  it('says why capacity is not cosmetic — P8', async () => {
    const user = userEvent.setup({ delay: null });
    renderEditor();

    const firstTable = MOCK_TABLES.find((table) => table.zoneId === MOCK_ZONES[0]?.id);
    await user.click(screen.getByRole('button', { name: `Table ${firstTable?.code ?? ''}` }));

    expect(screen.getByText(/revenue per seat-hour/)).toBeInTheDocument();
  });
});
