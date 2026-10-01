import { randomUUID } from 'node:crypto';
import { PageHeading } from '@/components/admin/PageHeading';
import { PurchaseOrderForm } from '@/components/admin/purchasing/PurchaseOrderForm';
import { requirePermissionPage } from '@/lib/auth/session';
import { readDemandCatalogue } from '@/lib/demand/queries';
import { readCurrentBusinessDate } from '@/lib/outlet/queries';
import { readSupplierOptions } from '@/lib/purchasing/queries';

/** A new purchase order — ADR 0035. `expenses.write`, checked again in the action. */
export default async function Page() {
  await requirePermissionPage('expenses.write');
  const [suppliers, catalogue, today] = await Promise.all([
    readSupplierOptions(),
    readDemandCatalogue(),
    readCurrentBusinessDate(),
  ]);
  return (
    <>
      <PageHeading
        title="New purchase order"
        note="Items come from the same list as the demand sheets and stock. The agreed amount is optional — fill it in when a price was agreed, so the bill can be checked against it."
      />
      <PurchaseOrderForm
        suppliers={suppliers}
        catalogue={catalogue}
        today={today}
        formKey={randomUUID()}
      />
    </>
  );
}
