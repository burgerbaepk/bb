import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { can } from '@natech/contracts';
import { Button } from '@natech/ui';
import { AccountForm } from '@/components/admin/accounts/AccountForm';
import { PageHeading } from '@/components/admin/PageHeading';
import { PrintButton } from '@/components/admin/PrintButton';
import { SettlementForm } from '@/components/admin/purchasing/SettlementForm';
import { StatementTable } from '@/components/admin/purchasing/StatementTable';
import { recordAccountPaymentAction, setAccountActiveAction } from '@/lib/accounts/actions';
import { readAccount } from '@/lib/accounts/queries';
import { requirePermissionPage } from '@/lib/auth/session';
import { readCurrentBusinessDate } from '@/lib/outlet/queries';
import { readOpenShift } from '@/lib/shifts/queries';

/**
 * One credit customer: the statement to hand them, a payment received, and
 * (for the owner) the limit — ADR 0036.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requirePermissionPage('reports.read');
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [detail, today, shift] = await Promise.all([
    readAccount(id),
    readCurrentBusinessDate(),
    readOpenShift(),
  ]);
  if (detail === null) notFound();
  const { account, statement } = detail;
  const isOwner = can(viewer, 'staff.write');

  return (
    <div className="print-document space-y-5">
      <PageHeading
        title={account.name}
        note={[
          account.phone,
          account.creditLimit === null ? 'No credit limit' : null,
          account.isActive ? null : 'Account closed — no new credit sales',
          account.note,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <PrintButton label="Print statement" />
            {isOwner && (
              <form
                className="no-print"
                action={setAccountActiveAction.bind(null, account.id, !account.isActive)}
              >
                <Button type="submit" tone="secondary">
                  {account.isActive ? 'Close account' : 'Reopen account'}
                </Button>
              </form>
            )}
          </>
        }
      />
      {can(viewer, 'payment.take') && (
        <SettlementForm
          action={recordAccountPaymentAction}
          partyField="accountId"
          partyId={account.id}
          formKey={randomUUID()}
          title="Receive a payment"
          balance={account.balance}
          balanceLabel="Owes now"
          tillLabel="Paid into the till"
          today={today}
          shiftOpen={shift !== null}
        />
      )}
      <StatementTable rows={statement} debitLabel="Sold" creditLabel="Paid" balanceLabel="Owes" />
      {isOwner && <AccountForm account={account} />}
    </div>
  );
}
