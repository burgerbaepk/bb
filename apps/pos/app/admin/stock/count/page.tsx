import { PageHeading } from '@/components/admin/PageHeading';
import { StockCountSheet } from '@/components/admin/StockCountSheet';
import { requirePermissionPage } from '@/lib/auth/session';
import { readStock } from '@/lib/stock/queries';

/**
 * The count sheet — ADR 0034. Write-only screen, so the page gate is the write
 * grant; the action checks `expenses.write` again.
 */
export default async function Page() {
  await requirePermissionPage('expenses.write');
  return (
    <>
      <PageHeading
        title="Count sheet"
        note="A physical count, dated today. Each filled box records what was on the shelf and the difference from the book, so shrinkage shows up item by item."
      />
      <StockCountSheet rows={await readStock()} />
    </>
  );
}
