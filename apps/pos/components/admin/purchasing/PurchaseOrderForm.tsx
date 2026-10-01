'use client';

import { useActionState } from 'react';
import { Send } from 'lucide-react';
import { Button, TextField } from '@natech/ui';
import { createPurchaseOrderAction, type PurchasingActionState } from '@/lib/purchasing/actions';
import type { DemandCatalogueGroup } from '@/lib/demand/queries';
import { FormOutcome } from './FormOutcome';
import { LinesEditor } from './LinesEditor';

const IDLE: PurchasingActionState = { error: null, message: null };
const SELECT = 'border-border bg-surface mt-1 min-h-touch w-full rounded-base border px-3';

/**
 * A new purchase order — ADR 0035. On success the action redirects to the
 * order, which is the printable copy to hand or send to the supplier.
 */
export function PurchaseOrderForm({
  suppliers,
  catalogue,
  today,
  formKey,
}: {
  readonly suppliers: readonly { id: string; name: string }[];
  readonly catalogue: readonly DemandCatalogueGroup[];
  readonly today: string;
  /**
   * R3 — minted by the server page, one per render, so a double submit
   * replays the first post instead of writing a second order. Not minted
   * here: a client `randomUUID()` would differ from the server's render.
   */
  readonly formKey: string;
}) {
  const [state, action, pending] = useActionState(createPurchaseOrderAction, IDLE);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="formKey" value={formKey} />
      <div className="border-border bg-surface-raised grid gap-4 rounded-base border p-4 md:grid-cols-2 xl:grid-cols-4">
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
        <TextField name="orderedOn" type="date" label="Order date" defaultValue={today} required />
        <TextField name="expectedOn" type="date" label="Expected delivery" min={today} />
        <TextField name="note" label="Note" placeholder="Delivery instructions" maxLength={500} />
      </div>
      <LinesEditor catalogue={catalogue} amountLabel="Agreed amount (Rs.)" amountRequired={false} />
      <div className="flex items-center gap-3">
        <Button type="submit" tone="primary" icon={Send} disabled={pending}>
          {pending ? 'Saving…' : 'Create purchase order'}
        </Button>
        <p className="text-ink-muted text-sm">
          An order moves no stock and owes nothing. The bill does both.
        </p>
      </div>
      <FormOutcome state={state} />
    </form>
  );
}
