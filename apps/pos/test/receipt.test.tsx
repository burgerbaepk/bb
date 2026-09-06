import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MOCK_OUTLET, MOCK_REFERENCE_INVOICE, MOCK_REFERENCE_ORDER } from '@natech/contracts/mocks';
import { paisa, computeTotals, DEFAULT_TAX_POLICY } from '@natech/domain';
import { toDomainLines } from '@natech/contracts';
import { BillPreviewReceipt } from '@/components/receipt/BillPreviewReceipt';
import { KitchenOrderTicket } from '@/components/receipt/KitchenOrderTicket';
import { KitchenOrderTicketPrintPortal } from '@/components/receipt/KitchenOrderTicketPrintPortal';
import { TaxInvoiceReceipt } from '@/components/receipt/TaxInvoiceReceipt';

describe('the sales invoice', () => {
  it('shows the invoice total and business date', () => {
    render(
      <TaxInvoiceReceipt
        outlet={MOCK_OUTLET}
        order={MOCK_REFERENCE_ORDER}
        invoice={MOCK_REFERENCE_INVOICE}
      />,
    );
    expect(screen.getByText('Business date')).toBeInTheDocument();
    expect(screen.getByText('22-AUG-2026')).toBeInTheDocument();
    expect(screen.getByText(/13,810/)).toBeInTheDocument();
  });

  it('prints the invoice number on a zero-tax sale receipt too', () => {
    // A sale with no tax rule in force is a SALE RECEIPT rather than a TAX
    // INVOICE, but it is still a numbered document off the same gap-free
    // counter (§5.8). The number must not be conditional on `taxLines`.
    const { container } = render(
      <TaxInvoiceReceipt
        outlet={MOCK_OUTLET}
        order={MOCK_REFERENCE_ORDER}
        invoice={{ ...MOCK_REFERENCE_INVOICE, taxLines: [], taxTotal: paisa(0n) }}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('SALE RECEIPT');
    expect(text).not.toContain('TAX INVOICE');
    expect(text).toContain('INVOICE NO.');
    expect(text).toContain(MOCK_REFERENCE_INVOICE.localNo);
  });

  it('uses the order number and offline label for an offline sale', () => {
    const { container } = render(
      <TaxInvoiceReceipt
        outlet={MOCK_OUTLET}
        order={MOCK_REFERENCE_ORDER}
        invoice={MOCK_REFERENCE_INVOICE}
        offline
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain(`ORDER: ${MOCK_REFERENCE_ORDER.orderNo}`);
    expect(text).toContain('OFFLINE RECEIPT');
    expect(text).not.toContain('SYNC');
    expect(text).not.toContain(MOCK_REFERENCE_INVOICE.localNo);
  });
});

it('prints the delivery address and separate delivery charge on the invoice', () => {
  render(
    <TaxInvoiceReceipt
      outlet={MOCK_OUTLET}
      order={{ ...MOCK_REFERENCE_ORDER, type: 'DELIVERY', deliveryAddress: 'House 12, Lahore' }}
      invoice={{ ...MOCK_REFERENCE_INVOICE, deliveryCharge: MOCK_REFERENCE_INVOICE.posFee }}
    />,
  );
  expect(screen.getByText('Delivery address: House 12, Lahore')).toBeInTheDocument();
  expect(screen.getByText('Delivery charges')).toBeInTheDocument();
});

const nonTaxTotals = computeTotals({
  lines: toDomainLines(MOCK_REFERENCE_ORDER),
  orderType: 'DINE_IN',
  orderDiscount: paisa(10000n),
  payments: [{ method: 'CASH', amount: paisa(0n) }],
  serviceStartedAt: MOCK_REFERENCE_ORDER.serviceStartedAt,
  rules: [],
  policy: { ...DEFAULT_TAX_POLICY, taxEnabled: false },
});
const staleLines = ['PRA registration pending', 'FBR sync pending', 'Tax invoice', 'Thank you'];

it('omits all inactive tax and fiscal wording on a discounted invoice, including configured text', () => {
  const { container } = render(
    <TaxInvoiceReceipt
      outlet={MOCK_OUTLET}
      order={MOCK_REFERENCE_ORDER}
      invoice={{ ...MOCK_REFERENCE_INVOICE, ...nonTaxTotals, taxLines: [] }}
      offline
      operatorHeaderLines={staleLines}
      operatorFooterLines={staleLines}
    />,
  );
  expect(container.textContent).not.toMatch(/\b(?:tax|untaxed|NTN|STRN|PRA|FBR|sync|fiscal)\b/i);
  expect(screen.getByText('Total after discount')).toBeInTheDocument();
  expect(screen.getByText('Service charge')).toBeInTheDocument();
});

it('omits inactive tax and fiscal wording on a discounted bill preview', () => {
  const { container } = render(
    <BillPreviewReceipt
      outlet={MOCK_OUTLET}
      order={MOCK_REFERENCE_ORDER}
      totals={nonTaxTotals}
      paymentMethod="CASH"
      operatorHeaderLines={staleLines}
      operatorFooterLines={staleLines}
    />,
  );
  expect(container.textContent).not.toMatch(/\b(?:tax|untaxed|NTN|STRN|PRA|FBR|sync|fiscal)\b/i);
  expect(screen.getByText('Total after discount')).toBeInTheDocument();
});

it('retains actual tax information on previously taxed invoices', () => {
  render(
    <TaxInvoiceReceipt
      outlet={MOCK_OUTLET}
      order={MOCK_REFERENCE_ORDER}
      invoice={MOCK_REFERENCE_INVOICE}
    />,
  );
  expect(screen.getByText('TAX INVOICE')).toBeInTheDocument();
  expect(screen.getAllByText(/Sales tax @/).length).toBeGreaterThan(0);
});

const kotProps = {
  outlet: MOCK_OUTLET,
  order: MOCK_REFERENCE_ORDER,
  printedAt: new Date('2026-09-06T12:00:00Z'),
  widthMm: 80 as const,
  showUrdu: false,
};

it('prints kitchen quantities, variants, modifiers and notes without financial details or voided items', () => {
  const line = MOCK_REFERENCE_ORDER.lines[0];
  if (!line) throw new Error('Fixture needs a line');
  const { container } = render(
    <KitchenOrderTicket
      {...kotProps}
      order={{
        ...MOCK_REFERENCE_ORDER,
        note: 'Pack separately',
        lines: [
          {
            ...line,
            nameSnapshot: 'Kitchen burger',
            variantLabel: 'Large',
            note: 'No onions',
            modifiers: [
              {
                id: 'extra',
                modifierId: null,
                nameSnapshot: 'Extra cheese',
                nameUrSnapshot: null,
                priceDelta: paisa(5000n),
              },
            ],
          },
          { ...line, id: 'voided', nameSnapshot: 'Voided burger', voidReason: 'Removed' },
        ],
      }}
    />,
  );
  expect(screen.getByText('KITCHEN ORDER TICKET')).toBeInTheDocument();
  for (const text of [
    'Kitchen burger',
    'Large',
    '+ Extra cheese',
    'Note: No onions',
    'Order note: Pack separately',
  ])
    expect(screen.getByText(text)).toBeInTheDocument();
  expect(screen.queryByText('Voided burger')).toBeNull();
  expect(container.textContent).not.toMatch(/\b(?:tax|NTN|price|total|payment|PRA|FBR)\b/i);
});

it('opens the browser print dialog once per KOT request and cleans up after printing', () => {
  vi.useFakeTimers();
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  const onDone = vi.fn();
  try {
    const view = render(<KitchenOrderTicketPrintPortal {...kotProps} onDone={onDone} />);
    act(() => vi.advanceTimersByTime(150));
    expect(print).toHaveBeenCalledOnce();
    act(() => window.dispatchEvent(new Event('afterprint')));
    expect(onDone).toHaveBeenCalledOnce();
    view.unmount();
    act(() => window.dispatchEvent(new Event('afterprint')));
    expect(onDone).toHaveBeenCalledOnce();
    const second = render(<KitchenOrderTicketPrintPortal {...kotProps} onDone={onDone} />);
    act(() => vi.advanceTimersByTime(150));
    expect(print).toHaveBeenCalledTimes(2);
    second.unmount();
  } finally {
    print.mockRestore();
    vi.useRealTimers();
  }
});

describe('Order Online on invoices', () => {
  it.each([58, 80] as const)(
    'renders a self-contained QR on %s mm invoices, including offline invoices',
    (widthMm) => {
      render(
        <TaxInvoiceReceipt
          outlet={MOCK_OUTLET}
          order={MOCK_REFERENCE_ORDER}
          invoice={MOCK_REFERENCE_INVOICE}
          storefrontUrl="https://orders.example.org"
          widthMm={widthMm}
          offline
        />,
      );
      expect(screen.getByText('Order Online')).toBeInTheDocument();
      expect(
        screen.getByRole('link', { name: 'Visit our online ordering website' }),
      ).toHaveAttribute('href', 'https://orders.example.org');
      const svg = screen.getByRole('img', { name: 'Scan to order online' });
      // Asserting the QR is unbrandable is the point of these two lines.
      expect(svg.querySelector('path')).toHaveAttribute('fill', '#000'); // brand-grep-allow
      expect(svg.querySelector('rect')).toHaveAttribute('fill', '#fff'); // brand-grep-allow
      expect(svg.style.width).toBe('32mm');
      expect(svg.style.height).toBe('32mm');
    },
  );
  it('prints no online-ordering prompt when the URL is not set', () => {
    render(
      <TaxInvoiceReceipt
        outlet={MOCK_OUTLET}
        order={MOCK_REFERENCE_ORDER}
        invoice={MOCK_REFERENCE_INVOICE}
      />,
    );
    expect(screen.queryByText('Order Online')).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Scan to order online' })).not.toBeInTheDocument();
  });
});
