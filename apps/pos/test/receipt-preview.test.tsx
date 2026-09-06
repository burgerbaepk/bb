import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MOCK_OUTLET, MOCK_REFERENCE_INVOICE, MOCK_REFERENCE_ORDER } from '@natech/contracts/mocks';
import { ReceiptPreview } from '@/components/admin/ReceiptPreview';

/**
 * The settings-screen previews — BUILD-PLAN.md §12, §14.3.
 *
 * The assertion that matters is the §12 one: exactly one of the three printed
 * documents carries the allocated invoice number, and it is the tax invoice.
 * A bill preview or a kitchen ticket that grew a number would be a document an
 * inspector could mistake for a fiscal receipt, which is the failure §12 names.
 */
const LATEST = { invoice: MOCK_REFERENCE_INVOICE, order: MOCK_REFERENCE_ORDER } as const;

function renderPreview() {
  return render(
    <ReceiptPreview
      outlet={MOCK_OUTLET}
      latest={LATEST}
      storefrontUrl="https://example.test"
      widthMm={80}
      showUrdu={false}
      headerLines={[]}
      footerLines={[]}
      paymentDetails={{
        bankName: '',
        iban: '',
        accountNumber: '',
        jazzCash: '',
        easyPaisa: '',
      }}
    />,
  );
}

describe('the receipt previews', () => {
  it('opens on the tax invoice and prints its allocated number', () => {
    renderPreview();
    expect(screen.getByText('TAX INVOICE')).toBeInTheDocument();
    const paper = screen.getByTestId('receipt-paper').textContent ?? '';
    expect(paper).toContain('INVOICE NO.');
    expect(paper).toContain(MOCK_REFERENCE_INVOICE.localNo);
  });

  it('names the real invoice the preview is rendered from', () => {
    renderPreview();
    expect(
      screen.getByText(new RegExp(`invoice ${MOCK_REFERENCE_INVOICE.localNo}`)),
    ).toBeInTheDocument();
  });

  it('keeps the invoice number off the bill preview and the kitchen ticket — §12', async () => {
    renderPreview();
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    // The paper only — the caption above it names the invoice on purpose.
    const paper = () => screen.getByTestId('receipt-paper').textContent ?? '';

    await user.click(screen.getByRole('button', { name: 'Bill preview' }));
    expect(screen.getByText('BILL PREVIEW')).toBeInTheDocument();
    expect(paper()).not.toContain(MOCK_REFERENCE_INVOICE.localNo);

    await user.click(screen.getByRole('button', { name: 'Kitchen ticket' }));
    expect(screen.getByText('KITCHEN ORDER TICKET')).toBeInTheDocument();
    expect(paper()).not.toContain(MOCK_REFERENCE_INVOICE.localNo);
  });

  it('explains itself rather than showing an empty frame before the first sale', () => {
    render(
      <ReceiptPreview
        outlet={MOCK_OUTLET}
        latest={null}
        storefrontUrl={null}
        widthMm={80}
        showUrdu={false}
        headerLines={[]}
        footerLines={[]}
        paymentDetails={{
          bankName: '',
          iban: '',
          accountNumber: '',
          jazzCash: '',
          easyPaisa: '',
        }}
      />,
    );
    expect(screen.getByText(/until the first sale is finalized/)).toBeInTheDocument();
  });
});
