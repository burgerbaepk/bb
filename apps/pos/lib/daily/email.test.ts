import { describe, expect, it } from 'vitest';
import { paisa } from '@natech/domain';
import { toEmailRgb } from './colour';
import { activitySummaryEmail, dailySalesEmail, esc, longDate, type EmailOutlet } from './email';

/**
 * ADR 0029 — the owner's daily emails. Asserted against what the owner must
 * be able to read, not against markup: the flag, who did it, the figure, and
 * that nothing a member of staff typed can break out of its cell.
 */
const OUTLET: EmailOutlet = {
  tradingName: 'Test Kitchen',
  legalName: 'Test Kitchen (Pvt) Ltd',
  address: '1 Example Road',
  city: 'Lahore',
  phone: '555-0100',
  email: 'owner@example.com',
  ntn: null,
  logoUrl: 'https://pos.example.com/images/logo.png',
  brandColour: 'rgb(200, 30, 30)',
  brandInk: 'rgb(30, 30, 30)',
  timezone: 'Asia/Karachi',
};

describe('toEmailRgb', () => {
  it('converts the oklch the branding row stores, which email clients drop', () => {
    expect(toEmailRgb('oklch(100% 0 0)', 'x')).toBe('rgb(255, 255, 255)');
    expect(toEmailRgb('oklch(0% 0 0)', 'x')).toBe('rgb(0, 0, 0)');
    // The seeded brand red lands in the red corner, not on grey.
    const [r, g, b] = toEmailRgb('oklch(58% 0.22 28)', 'x').slice(4, -1).split(', ').map(Number);
    expect(r).toBeGreaterThan(180);
    expect(g).toBeLessThan(80);
    expect(b).toBeLessThan(80);
  });

  it('passes rgb through, converts six-digit hex, and falls back on anything else', () => {
    expect(toEmailRgb('rgb(1 2 3)', 'x')).toBe('rgb(1, 2, 3)');
    expect(toEmailRgb('#FF0080', 'x')).toBe('rgb(255, 0, 128)'); // brand-grep-allow: converter input
    expect(toEmailRgb('var(--brand)', 'fallback')).toBe('fallback');
  });
});

describe('the daily sales report', () => {
  const base = {
    outlet: OUTLET,
    businessDate: '2026-09-24',
    generatedAt: new Date('2026-09-25T01:30:00Z'),
    day: {
      businessDate: '2026-09-24',
      invoiceCount: 4,
      covers: 6,
      netSales: paisa(1_000_000n),
      taxCollected: paisa(0n),
      deliveryCharge: paisa(15_000n),
      serviceCharge: paisa(0n),
      grossTakings: paisa(1_015_000n),
    },
    paymentMix: [
      {
        method: 'CASH' as const,
        approvedCount: 4,
        declinedCount: 0,
        amount: paisa(1_015_000n),
        shareBps: 10_000,
      },
    ],
    channelMix: [],
    topItems: [
      {
        itemName: '<script>alert(1)</script>',
        categoryName: 'Burgers',
        qtySold: '2.000',
        netSales: paisa(140_000n),
      },
    ],
    exceptions: [],
    flaggedCount: 0,
  };

  it('leads with gross takings, invoice count and the owner-facing date', () => {
    const email = dailySalesEmail(base);
    expect(email.subject).toBe('Daily Sales Report — Thursday, 24 September 2026 — Rs. 10,150');
    expect(email.html).toContain('Rs. 10,150');
    expect(email.html).toContain('Gross takings');
    expect(email.text).toContain('from 4 invoices');
  });

  it('carries the outlet identity, logo and the disclaimer', () => {
    const { html } = dailySalesEmail(base);
    expect(html).toContain('src="https://pos.example.com/images/logo.png"');
    expect(html).toContain('Test Kitchen (Pvt) Ltd');
    expect(html).toContain('1 Example Road, Lahore');
    expect(html).toContain('Confidential.');
    expect(html).toContain('not a tax invoice or a fiscal return');
  });

  it('escapes what staff typed', () => {
    const { html } = dailySalesEmail(base);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(esc(`"a" & 'b'`)).toBe('&quot;a&quot; &amp; &#39;b&#39;');
  });

  it('says so, in red, when a bill was voided after printing', () => {
    const { html } = dailySalesEmail({ ...base, flaggedCount: 2 });
    expect(html).toContain('Needs your attention.');
    expect(html).toContain('2 orders were');
  });
});

describe('the activity summary', () => {
  const base = {
    outlet: OUTLET,
    businessDate: '2026-09-24',
    generatedAt: new Date('2026-09-25T01:30:00Z'),
    actionCount: 42,
    flagged: [],
    unfinalized: [],
    notable: [],
    staff: [{ name: 'Ali', role: 'MANAGER', actions: 42, billsPrinted: 3, voids: 1, discounts: 0 }],
  };

  it('reports a clean day as nothing to review', () => {
    const email = activitySummaryEmail(base);
    expect(email.subject).toBe('Activity Summary — Thursday, 24 September 2026');
    expect(email.html).toContain('Nothing to review.');
  });

  it('lists a void after a printed bill with who, when and the quoted figure', () => {
    const email = activitySummaryEmail({
      ...base,
      flagged: [
        {
          at: new Date('2026-09-24T16:05:00Z'),
          orderNo: 17,
          printed: true,
          quoted: paisa(163_000n),
          voidedBy: 'Ali',
          billBy: 'Sara',
        },
      ],
    });
    expect(email.subject).toContain('1 to review');
    expect(email.html).toContain('Voided after the bill was printed or shown');
    expect(email.html).toContain('#17');
    expect(email.html).toContain('Printed');
    expect(email.html).toContain('by Sara');
    expect(email.html).toContain('Rs. 1,630');
    // 16:05 UTC is 9:05 pm in Karachi.
    expect(email.text).toContain(
      '09:05 pm Order #17 — bill printed by Sara, voided by Ali, quoted Rs. 1,630',
    );
  });
});

it('formats a business date as a date, not an instant', () => {
  expect(longDate('2026-01-01')).toBe('Thursday, 1 January 2026');
});
