'use client';

import { useActionState } from 'react';
import { ReceiptText } from 'lucide-react';
import { Button, TextField } from '@natech/ui';
import { postSupplierBillAction, type PurchasingActionState } from '@/lib/purchasing/actions';
import type { DemandCatalogueGroup } from '@/lib/demand/queries';
import { FormOutcome } from './FormOutcome';
import { LinesEditor, type LineSeed } from './LinesEditor';

const IDLE: PurchasingActionState = { error: null, message: null };
const SELECT = 'border-border bg-surface mt-1 min-h-touch w-full rounded-base border px-3';

/**
 * Enter a supplier's bill — ADR 0035. Copy it off the paper: their invoice
 * number, the date on it, each line's quantity and amount, then whatever they
 * added (their tax, freight) and took off.
 *
 * Entered against a purchase order, the supplier is fixed and the order's
 * lines are filled in to be corrected to what actually arrived.
 */
export function BillForm({
  suppliers,
  catalogue,
  today,
  formKey,
  order,
}: {
  readonly suppliers: readonly { id: string; name: string }[];
  readonly catalogue: readonly DemandCatalogueGroup[];
  readonly today: string;
  /** R3 — minted by the server page; see `PurchaseOrderForm`. */
  readonly formKey: string;
  readonly order: {
    readonly id: string;
    readonly poNo: number;
    readonly supplierId: string;
    readonly supplierName: string;
    readonly lines: readonly LineSeed[];
  } | null;
}) {
  const [state, action, pending] = useActionState(postSupplierBillAction, IDLE);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="formKey" value={formKey} />
      <div className="border-border bg-surface-raised grid gap-4 rounded-base border p-4 md:grid-cols-2 xl:grid-cols-4">
        {order === null ? (
          <label className="text-sm font-medium">
            Supplier
            <select name="supplierId" required defaultValue="" className={SELECT}>
              <option value="" disabled>
                Choose…
              </option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="text-sm">
            <p className="font-medium">Supplier</p>
            <p className="mt-2">
              {order.supplierName} · against PO #{order.poNo}
            </p>
            <input type="hidden" name="supplierId" value={order.supplierId} />
            <input type="hidden" name="purchaseOrderId" value={order.id} />
          </div>
        )}
        <TextField
          name="supplierRef"
          label="Their invoice number"
          help="Stops the same bill being entered twice."
          maxLength={60}
        />
        <TextField
          name="billedOn"
          type="date"
          label="Bill date"
          defaultValue={today}
          max={today}
          required
        />
        <TextField name="dueOn" type="date" label="Due date" />
      </div>

      <LinesEditor
        catalogue={catalogue}
        seed={order?.lines ?? []}
        amountLabel="Line amount (Rs.)"
        amountRequired
      />

      <div className="border-border bg-surface-raised grid gap-4 rounded-base border p-4 md:grid-cols-3">
        <TextField
          name="charges"
          label="Other charges (Rs.)"
          help="Their sales tax, freight, loading — anything added under the goods."
          inputMode="decimal"
          placeholder="0.00"
        />
        <TextField name="discount" label="Discount (Rs.)" inputMode="decimal" placeholder="0.00" />
        <TextField name="note" label="Note" maxLength={500} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" tone="primary" icon={ReceiptText} disabled={pending}>
          {pending ? 'Posting…' : 'Post bill'}
        </Button>
        <p className="text-ink-muted text-sm">
          Posting adds the total to what you owe {order?.supplierName ?? 'the supplier'} and books
          every line into stock as received.
          {order === null ? '' : ` PO #${order.poNo} is closed.`} A posted bill cannot be edited —
          cancel it and enter it again.
        </p>
      </div>
      <FormOutcome state={state} />
    </form>
  );
}
