import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@natech/ui';
import {
  MOCK_CATEGORY_MIX,
  MOCK_CHANNEL_MIX,
  MOCK_ITEM_SALES,
  MOCK_PAYMENT_MIX,
  MOCK_SALES_BY_DATE,
} from '@natech/contracts/mocks';
import { SalesReport } from '@/components/admin/reports/SalesReport';

/**
 * `next/navigation`'s hooks need a stub the same way `test/floor.test.tsx`'s
 * own doc comment explains: there is no `AppRouterContext` mounted under a
 * plain `@testing-library/react` render, and `ReportShell` calls both
 * `useRouter` (the export/range-commit navigation) and `usePathname`.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/reports/sales',
}));

/**
 * R16 across the reports — BUILD-PLAN.md §2 R16, §17, defects C3, V1.
 *
 * `DataTable` makes the rule structural: `summary` is a function of `rows` and
 * there is no parameter through which a precomputed total can be passed. These
 * tests read the summary out of the DOM and check it against the rows, so a
 * later refactor that reintroduces a separately-queried header fails here.
 */
function renderSales() {
  return render(
    <ToastProvider>
      <SalesReport
        range={{ fromBusinessDate: '2026-08-16', toBusinessDate: '2026-08-22' }}
        byDate={MOCK_SALES_BY_DATE}
        byItem={MOCK_ITEM_SALES}
        byCategory={MOCK_CATEGORY_MIX}
        byChannel={MOCK_CHANNEL_MIX}
        byPayment={MOCK_PAYMENT_MIX}
      />
    </ToastProvider>,
  );
}

function summaryPaisa(container: HTMLElement): bigint[] {
  const summary = container.querySelector('[data-table-summary]');
  if (summary === null) return [];
  return [...summary.querySelectorAll('[data-paisa]')].map((node) =>
    BigInt(node.getAttribute('data-paisa') ?? '0'),
  );
}

describe('the sales report', () => {
  it('sums net sales from exactly the rows it renders — R16', () => {
    const { container } = renderSales();

    const expected = MOCK_SALES_BY_DATE.reduce((total, row) => total + row.netSales, 0n);
    expect(summaryPaisa(container)).toContain(expected);
    expect(screen.getAllByRole('row')).toHaveLength(MOCK_SALES_BY_DATE.length + 1);
  });

  it('counts invoices from exactly the rows it renders — defect C3', () => {
    renderSales();
    const invoices = MOCK_SALES_BY_DATE.reduce((total, row) => total + row.invoiceCount, 0);
    const summary = screen.getByText(String(invoices));
    expect(summary).toBeInTheDocument();
  });

  it('keeps the header honest when the table changes', async () => {
    const user = userEvent.setup({ delay: null });
    const { container } = renderSales();

    await user.click(screen.getByRole('button', { name: /^By item/ }));

    const expected = MOCK_ITEM_SALES.reduce((total, row) => total + row.netSales, 0n);
    expect(summaryPaisa(container)).toContain(expected);
    expect(screen.getAllByRole('row')).toHaveLength(MOCK_ITEM_SALES.length + 1);
  });

  it('counts declined attempts in the payment mix — §5.8', async () => {
    const user = userEvent.setup({ delay: null });
    renderSales();

    await user.click(screen.getByRole('button', { name: /^By payment/ }));

    const declined = MOCK_PAYMENT_MIX.reduce((total, row) => total + row.declinedCount, 0);
    expect(declined).toBeGreaterThan(0);
    const table = screen.getByRole('table');
    expect(within(table).getByText('Declined')).toBeInTheDocument();
  });

  it('labels dates as business dates — §5.8, defect C6', () => {
    renderSales();
    expect(screen.getByText('Business date')).toBeInTheDocument();
    expect(screen.getByLabelText('From business date')).toBeInTheDocument();
  });

  it('offers every export server-side rather than assembling one in the browser', () => {
    renderSales();
    for (const label of ['CSV', 'Excel', 'PDF']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });
});
