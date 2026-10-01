import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { can } from '@natech/contracts';
import { Button } from '@natech/ui';
import { PageHeading } from '@/components/admin/PageHeading';
import { PrintButton } from '@/components/admin/PrintButton';
import { SettlementForm } from '@/components/admin/purchasing/SettlementForm';
import { StatementTable } from '@/components/admin/purchasing/StatementTable';
import { SupplierForm } from '@/components/admin/purchasing/SupplierForm';
import { requirePermissionPage } from '@/lib/auth/session';
import { readCurrentBusinessDate } from '@/lib/outlet/queries';
import { recordSupplierPaymentAction, setSupplierActiveAction } from '@/lib/purchasing/actions';
import { readSupplier } from '@/lib/purchasing/queries';
import { readOpenShift } from '@/lib/shifts/queries';

/**
 * One supplier: the statement, a payment, and the details —
 * ADR 0035.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requirePermissionPage('reports.read');
  const { id } = await params;
  // A malformed id would reach Postgres as a uuid cast error; treat it as absent.
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [detail, today, shift] = await Promise.all([
    readSupplier(id),
    readCurrentBusinessDate(),
    readOpenShift(),
  ]);
  if (detail === null) notFound();
  const { supplier, statement } = detail;
  const canManage = can(viewer, 'expenses.write');

  return (
    <div className="print-document space-y-5">
      <PageHeading
        title={supplier.name}
        note={[
          supplier.contactPerson,
          supplier.phone,
          supplier.address,
          supplier.ntn === null ? null : `NTN ${supplier.ntn}`,
          supplier.isActive ? null : 'Inactive',
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <PrintButton label="Print statement" />
            {canManage && (
              <form
                className="no-print"
                action={setSupplierActiveAction.bind(null, supplier.id, !supplier.isActive)}
              >
                <Button type="submit" tone="secondary">
                  {supplier.isActive ? 'Deactivate' : 'Reactivate'}
                </Button>
              </form>
            )}
          </>
        }
      />
      {can(viewer, 'expenses.write') && (
        <SettlementForm
          action={recordSupplierPaymentAction}
          partyField="supplierId"
          partyId={supplier.id}
          formKey={randomUUID()}
          title="Pay this supplier"
          balance={supplier.balance}
          balanceLabel="Owed now"
          tillLabel="Paid from the till"
          today={today}
          shiftOpen={shift !== null}
        />
      )}
      <StatementTable rows={statement} debitLabel="Billed" creditLabel="Paid" balanceLabel="Owed" />
      {canManage && <SupplierForm supplier={supplier} />}
    </div>
  );
}
