import { randomUUID } from 'node:crypto';
import { PageHeading } from '@/components/admin/PageHeading';
import { BillForm } from '@/components/admin/purchasing/BillForm';
import { requirePermissionPage } from '@/lib/auth/session';
import { readDemandCatalogue } from '@/lib/demand/queries';
import { readCurrentBusinessDate } from '@/lib/outlet/queries';
import { readPurchaseOrder, readSupplierOptions } from '@/lib/purchasing/queries';
import { qtyToString } from '@natech/domain';

/**
 * Enter a supplier bill — ADR 0035. `?po=<id>` enters it against an open
 * purchase order: the supplier is fixed and the order's lines are filled in,
 * to be corrected to what actually arrived.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermissionPage('expenses.write');
  const poParam = (await searchParams)['po'];
  const [suppliers, catalogue, today, order] = await Promise.all([
    readSupplierOptions(),
    readDemandCatalogue(),
    readCurrentBusinessDate(),
    typeof poParam === 'string' && /^[0-9a-f-]{36}$/i.test(poParam)
      ? readPurchaseOrder(poParam)
      : Promise.resolve(null),
  ]);
  const open = order !== null && order.status === 'OPEN' ? order : null;

  return (
    <>
      <PageHeading
        title={open === null ? 'Enter a supplier bill' : `Bill against PO #${open.poNo}`}
        note="Copy the supplier's bill line by line: quantity, and the amount the bill states for that line. An item with no unit yet asks for one, because the bill is its first stock movement."
      />
      <BillForm
        suppliers={suppliers}
        catalogue={catalogue}
        today={today}
        formKey={randomUUID()}
        order={
          open === null
            ? null
            : {
                id: open.id,
                poNo: open.poNo,
                supplierId: open.supplierId,
                supplierName: open.supplierName,
                lines: open.lines.map((line) => ({
                  itemId: line.itemId,
                  qty: qtyToString(line.quantity).replace(/\.?0+$/, ''),
                  amount:
                    line.amount === null
                      ? ''
                      : `${line.amount / 100n}.${String(line.amount % 100n).padStart(2, '0')}`,
                })),
              }
        }
      />
    </>
  );
}
