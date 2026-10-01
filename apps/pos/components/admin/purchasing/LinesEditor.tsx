'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { IconButton, Money } from '@natech/ui';
import { divideHalfUp, paisa, parsePaisa, parseQty, sum, type Paisa } from '@natech/domain';
import type { DemandCatalogueGroup } from '@/lib/demand/queries';

const CONTROL = 'border-border bg-surface min-h-touch w-full rounded-base border px-2';

export interface LineSeed {
  readonly itemId: string;
  readonly qty: string;
  readonly amount: string;
}

interface Row extends LineSeed {
  readonly key: number;
  readonly unit: string;
}

const blank = (key: number): Row => ({ key, itemId: '', qty: '', amount: '', unit: '' });

/** The per-unit rate, by integer division (R1). Null until both boxes parse. */
function rateOf(amount: Paisa | null, qtyText: string): Paisa | null {
  if (amount === null) return null;
  try {
    const quantity = parseQty(qtyText);
    // Qty is thousandths, so amount × 1000 / qty is paisa per whole unit.
    return quantity > 0n ? paisa(divideHalfUp(amount * 1000n, quantity)) : null;
  } catch {
    return null;
  }
}

/** The rupee box as money, or null while it does not parse. Display only; the action re-parses. */
function rupees(text: string): Paisa | null {
  try {
    return parsePaisa(text.trim().replace(/,/g, ''));
  } catch {
    return null;
  }
}

/**
 * The line rows of a purchase order or a supplier bill — ADR 0035.
 *
 * Posts parallel `line.*` fields in screen order, which `postedLines` in the
 * action zips back together. There is always one empty row at the bottom, so
 * the manager copying a bill never has to look for an "add line" button: they
 * pick the next item and a new blank row appears under it.
 *
 * The unit box appears only for an item with no saved unit (ADR 0034: the
 * first movement gives an item its unit). The amount is the line value as the
 * bill prints it, not a rate, because that is the figure on the paper; the
 * rate is shown beside it for a sense check.
 */
export function LinesEditor({
  catalogue,
  seed = [],
  amountLabel,
  amountRequired,
}: {
  readonly catalogue: readonly DemandCatalogueGroup[];
  readonly seed?: readonly LineSeed[];
  readonly amountLabel: string;
  readonly amountRequired: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => [
    ...seed.map((line, index) => ({ ...line, key: index, unit: '' })),
    blank(seed.length),
  ]);
  const units = new Map(
    catalogue.flatMap((group) => group.items.map((item) => [item.id, item.defaultUnit] as const)),
  );

  const update = (key: number, patch: Partial<Row>) =>
    setRows((current) => {
      const next = current.map((row) => (row.key === key ? { ...row, ...patch } : row));
      const last = next.at(-1);
      // Keep exactly one blank row at the foot.
      if (last !== undefined && last.itemId !== '')
        next.push(blank(Math.max(...next.map((row) => row.key)) + 1));
      return next;
    });
  const remove = (key: number) =>
    setRows((current) => {
      const next = current.filter((row) => row.key !== key);
      return next.length === 0 || next.at(-1)?.itemId !== '' ? [...next, blank(key + 1000)] : next;
    });

  const total = sum(rows.map((row) => rupees(row.amount) ?? paisa(0n)));

  return (
    <div className="border-border overflow-x-auto rounded-base border">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="bg-surface-sunken text-ink-muted text-start text-xs">
          <tr>
            <th className="px-2 py-2 font-medium">Item</th>
            <th className="w-28 px-2 py-2 font-medium">Quantity</th>
            <th className="w-40 px-2 py-2 font-medium">{amountLabel}</th>
            <th className="w-28 px-2 py-2 text-end font-medium">Rate</th>
            <th className="w-12" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const savedUnit = row.itemId === '' ? undefined : units.get(row.itemId);
            const rate = rateOf(rupees(row.amount), row.qty);
            return (
              <tr key={row.key} className="border-border border-t align-top">
                <td className="px-2 py-1.5">
                  <select
                    name="line.itemId"
                    value={row.itemId}
                    onChange={(event) => update(row.key, { itemId: event.target.value })}
                    aria-label={`Item on line ${index + 1}`}
                    className={CONTROL}
                  >
                    <option value="">Choose an item…</option>
                    {catalogue.map((group) => (
                      <optgroup key={group.category} label={group.category}>
                        {group.items.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                            {item.defaultUnit === null ? '' : ` (${item.defaultUnit})`}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {savedUnit === null ? (
                    <input
                      name="line.unit"
                      value={row.unit}
                      onChange={(event) => update(row.key, { unit: event.target.value })}
                      placeholder="Unit — kg, litre, piece"
                      aria-label={`Unit for line ${index + 1}`}
                      maxLength={32}
                      className={`${CONTROL} mt-1`}
                    />
                  ) : (
                    <input type="hidden" name="line.unit" value="" />
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <input
                    name="line.qty"
                    value={row.qty}
                    onChange={(event) => update(row.key, { qty: event.target.value })}
                    inputMode="decimal"
                    placeholder="0"
                    aria-label={`Quantity on line ${index + 1}`}
                    className={CONTROL}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    name="line.amount"
                    value={row.amount}
                    onChange={(event) => update(row.key, { amount: event.target.value })}
                    inputMode="decimal"
                    placeholder={amountRequired ? '0.00' : 'Optional'}
                    aria-label={`${amountLabel} on line ${index + 1}`}
                    className={CONTROL}
                  />
                </td>
                <td className="text-ink-muted px-2 py-3 text-end tabular-nums">
                  {rate === null ? '—' : <Money value={rate} />}
                </td>
                <td className="px-1 py-1.5">
                  {row.itemId !== '' && (
                    <IconButton
                      icon={Trash2}
                      label={`Remove line ${index + 1}`}
                      tone="ghost"
                      size="sm"
                      onClick={() => remove(row.key)}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-border border-t font-semibold">
            <td className="px-2 py-2" colSpan={2}>
              Goods total
            </td>
            <td className="px-2 py-2 tabular-nums">
              <Money value={total} symbol="Rs." />
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
