import { beforeEach, describe, expect, it, vi } from 'vitest';

const { limit } = vi.hoisted(() => ({ limit: vi.fn() }));
vi.mock('@natech/db', () => ({
  settings: { key: 'key', value: 'value' },
  dbRead: () => ({ select: () => ({ from: () => ({ where: () => ({ limit }) }) }) }),
}));
vi.mock('drizzle-orm', () => ({ eq: vi.fn() }));
import { readInvoiceStorefrontUrl } from './queries';

describe('invoice storefront URL setting', () => {
  beforeEach(() => limit.mockReset());
  it('reads the public website URL saved by the admin', async () => {
    limit.mockResolvedValue([{ value: { siteUrl: 'https://orders.example.org' } }]);
    await expect(readInvoiceStorefrontUrl()).resolves.toBe('https://orders.example.org');
  });
  it.each([
    { rows: [] },
    { rows: [{ value: { siteUrl: '' } }] },
    { rows: [{ value: { siteUrl: 'invalid' } }] },
  ])(
    'omits absent, blank, or invalid settings without a deployment URL fallback',
    async ({ rows }) => {
      // Each case is the array of rows returned by the settings query.
      limit.mockResolvedValue(rows);
      await expect(readInvoiceStorefrontUrl()).resolves.toBeNull();
    },
  );
});
