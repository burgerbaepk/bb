import { CircleAlert, Search } from 'lucide-react';
import { Money, StatusPill } from '@natech/ui';
import { paisa } from '@natech/domain';
import type { ActivityRow } from '@/lib/activity/queries';
import { PageHeading } from './PageHeading';
import { formatDateTime } from '@/components/lib/format';

/**
 * Who did what, and when — BUILD-PLAN.md §2 R7, §14.1; ADR 0027.
 *
 * The rows are `audit_log` unchanged. Nothing is summarised away and nothing
 * is editable, because the value of this screen is that it is the same record
 * an inspector would be handed under PSTSA s.32(2). A "tidied" activity feed
 * that dropped the boring rows would be a different document.
 *
 * The actions worth stopping on are marked. `ORDER_BILL_PRINTED` is the one
 * this screen was built for: a total handed to a customer on paper is the step
 * before either an invoice or a theft, and it is the only entry here that is
 * evidence of a customer interaction the system may never see the money from.
 */
const NOTABLE: Readonly<
  Record<string, { readonly tone: 'danger' | 'warn'; readonly label: string }>
> = {
  // ADR 0029 — the pair ADR 0027 was written against: a bill in the
  // customer's hand, then the order made to disappear.
  ORDER_VOIDED_AFTER_BILL_PRINTED: { tone: 'danger', label: 'voided after bill printed' },
  ORDER_VOIDED_AFTER_BILL_VIEWED: { tone: 'danger', label: 'voided after bill shown' },
  ORDER_BILL_PRINTED: { tone: 'danger', label: 'bill printed' },
  ORDER_BILL_VIEWED: { tone: 'warn', label: 'bill shown' },
  ORDER_VOIDED: { tone: 'danger', label: 'order voided' },
  ORDER_LINE_VOIDED: { tone: 'warn', label: 'line voided' },
  ORDER_DISCOUNT_SET: { tone: 'warn', label: 'discount set' },
};

/** The money figure an audit row recorded, if it recorded one. */
function amountOf(after: unknown): bigint | null {
  if (typeof after !== 'object' || after === null) return null;
  const record = after as Record<string, unknown>;
  const value = record['grandTotal'] ?? record['orderDiscount'];
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return BigInt(value);
  return null;
}

export function ActivityLog({
  rows,
  actors,
  timezone,
  filters,
}: {
  readonly rows: readonly ActivityRow[];
  readonly actors: ReadonlyArray<{ id: string; name: string; role: string | null }>;
  readonly timezone: string;
  readonly filters: { actorId: string; role: string; action: string; from: string; to: string };
}) {
  return (
    <>
      <PageHeading
        title="Activity log"
        note="Every recorded action, newest first, with the staff member responsible. Bills printed and orders voided are highlighted, and an order voided after its bill was printed or shown is flagged in red. An order whose bill was printed and never finalized also appears on the exceptions report."
      />

      <form className="border-border bg-surface-raised mb-4 grid gap-3 rounded-base border p-4 md:grid-cols-[1fr_1fr_1fr_auto_auto_auto]">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Staff member</span>
          <select
            className="border-border bg-surface min-h-touch w-full rounded-base border px-3 py-2"
            name="actorId"
            defaultValue={filters.actorId}
          >
            <option value="">Everyone</option>
            {actors.map((actor) => (
              <option key={actor.id} value={actor.id}>
                {actor.name}
                {actor.role === null ? '' : ` (${actor.role.toLowerCase()})`}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Role</span>
          <select
            className="border-border bg-surface min-h-touch w-full rounded-base border px-3 py-2"
            name="role"
            defaultValue={filters.role}
          >
            <option value="">All roles</option>
            {['OWNER', 'MANAGER', 'CASHIER', 'WAITER', 'AUDITOR'].map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Action or entity</span>
          <input
            className="border-border bg-surface min-h-touch w-full rounded-base border px-3 py-2"
            name="action"
            defaultValue={filters.action}
            placeholder="BILL_PRINTED, orders, …"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">From</span>
          <input
            className="border-border bg-surface min-h-touch rounded-base border px-3 py-2"
            type="date"
            name="from"
            defaultValue={filters.from}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">To</span>
          <input
            className="border-border bg-surface min-h-touch rounded-base border px-3 py-2"
            type="date"
            name="to"
            defaultValue={filters.to}
          />
        </label>
        <button
          className="bg-primary text-primary-ink min-h-touch mt-auto flex items-center justify-center gap-2 rounded-base px-4 py-2"
          type="submit"
        >
          <Search className="size-4" aria-hidden="true" />
          Find
        </button>
      </form>

      <div className="border-border overflow-x-auto rounded-base border">
        <table className="w-full text-sm">
          <caption className="sr-only">Recorded staff activity</caption>
          <thead className="bg-surface-sunken text-start">
            <tr>
              <th className="p-3 text-start">When</th>
              <th className="p-3 text-start">Who</th>
              <th className="p-3 text-start">Action</th>
              <th className="p-3 text-start">Record</th>
              <th className="p-3 text-end">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {rows.map((row) => {
              const notable = NOTABLE[row.action];
              const amount = amountOf(row.after);
              return (
                <tr key={row.id} className="hover:bg-surface-sunken">
                  <td className="p-3 whitespace-nowrap">
                    {formatDateTime(row.at, timezone)}
                    {row.ip !== null && (
                      <span className="text-ink-subtle block text-xs">{row.ip}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {row.actorName ?? 'System'}
                    {row.actorRole !== null && (
                      <span className="text-ink-subtle block text-xs">
                        {row.actorRole.toLowerCase()}
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {notable === undefined ? (
                      <span className="font-medium">
                        {row.action.replaceAll('_', ' ').toLowerCase()}
                      </span>
                    ) : (
                      // R15 — the tone never carries the meaning alone.
                      <StatusPill
                        size="sm"
                        tone={notable.tone}
                        icon={CircleAlert}
                        label={notable.label}
                      />
                    )}
                  </td>
                  <td className="p-3">
                    {row.entity}
                    {row.entityId !== null && (
                      <span className="text-ink-subtle block font-mono text-xs">
                        {row.entityId.slice(0, 8)}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-end">
                    {amount === null ? (
                      <span className="text-ink-subtle">—</span>
                    ) : (
                      <Money value={paisa(amount)} symbol="Rs." emphasis="strong" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="text-ink-muted p-8 text-center">No activity matches these filters.</p>
        )}
      </div>
      <p className="text-ink-subtle mt-2 text-xs">
        Showing the {rows.length} most recent matching entries, up to 200. The full record is
        retained for six years (PSTSA s.32(1)) and is never edited or deleted from here.
      </p>
    </>
  );
}
