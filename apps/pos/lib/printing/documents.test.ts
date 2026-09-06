import { describe, expect, it, vi } from 'vitest';
import { paisa } from '@natech/domain';
import { MOCK_OUTLET, MOCK_REFERENCE_INVOICE, MOCK_REFERENCE_ORDER } from '@natech/contracts/mocks';
import { invoiceEscPosDocument } from './documents';

vi.mock('server-only', () => ({}));
vi.mock('@natech/print-bridge/raster', () => ({
  rasterizeLogoImage: vi.fn(),
  rasterizeUrduLine: vi.fn(),
}));

describe('physical invoice text', () => {
  it('omits inactive tax identity and stale fiscal notices', async () => {
    const document = await invoiceEscPosDocument(
      MOCK_OUTLET,
      MOCK_REFERENCE_ORDER,
      { ...MOCK_REFERENCE_INVOICE, taxLines: [], taxTotal: paisa(0n) },
      {
        showUrdu: false,
        logoReceiptUrl: null,
        headerLines: ['PRA registration pending\nWelcome', 'NTN: old registration'],
        footerLines: ['FBR sync pending', 'Tax invoice', 'Visit again'],
      },
    );
    const text = document.lines.map((line) => ('text' in line ? line.text : '')).join('\n');
    expect(text).not.toMatch(/\b(?:tax|NTN|STRN|PRA|FBR|sync|fiscal)\b/i);
    expect(text).toContain('SALE RECEIPT');
    expect(text).toContain('Welcome');
    expect(text).toContain('Visit again');
  });
  it('keeps real tax amounts on a taxed invoice without claiming fiscal synchronization', async () => {
    const document = await invoiceEscPosDocument(
      MOCK_OUTLET,
      MOCK_REFERENCE_ORDER,
      MOCK_REFERENCE_INVOICE,
    );
    const text = document.lines.map((line) => ('text' in line ? line.text : '')).join('\n');
    expect(text).toContain('TAX INVOICE');
    expect(text).toContain('Sales tax @');
    expect(text).not.toMatch(/\b(?:PRA|FBR|sync|fiscal)\b/i);
  });
});

it('includes a centered online-ordering QR only when a storefront URL is set', async () => {
  const configured = await invoiceEscPosDocument(
    MOCK_OUTLET,
    MOCK_REFERENCE_ORDER,
    MOCK_REFERENCE_INVOICE,
    {
      showUrdu: false,
      logoReceiptUrl: null,
      storefrontUrl: 'https://orders.example.org',
    },
  );
  const index = configured.lines.findIndex(
    (line) => 'text' in line && line.text === 'Order Online',
  );
  expect(index).toBeGreaterThan(0);
  expect(configured.lines[index]).toMatchObject({ align: 'center', bold: true });
  expect(configured.lines[index + 1]).toMatchObject({
    align: 'center',
    raster: { widthDots: expect.any(Number), packed: expect.any(Buffer) },
  });
  const unset = await invoiceEscPosDocument(
    MOCK_OUTLET,
    MOCK_REFERENCE_ORDER,
    MOCK_REFERENCE_INVOICE,
  );
  expect(unset.lines.some((line) => 'text' in line && line.text === 'Order Online')).toBe(false);
  expect(unset.lines.some((line) => 'raster' in line)).toBe(false);
});
