'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Ban,
  Banknote,
  ClipboardCheck,
  ChefHat,
  ClipboardList,
  Minus,
  Percent,
  Plus,
  ReceiptText,
  Trash2,
  User,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {
  Button,
  EmptyState,
  IconButton,
  Money,
  SegmentedControl,
  TextField,
  formatPaisa,
} from '@natech/ui';
import type { Paisa, Totals } from '@natech/domain';
import type { OrderType, PaymentMethod } from '@natech/contracts';
import { PAYMENT_METHOD_LABELS, formatRate } from '@/components/lib/format';
import { lineLabel, unitPriceOf, type CartLine } from './cartModel';

const ORDER_TYPE_OPTIONS: ReadonlyArray<{ readonly value: OrderType; readonly label: string }> = [
  { value: 'DINE_IN', label: 'Dine-in' },
  { value: 'TAKE_AWAY', label: 'Takeaway' },
  { value: 'DELIVERY', label: 'Delivery' },
];

/**
 * The cart — BUILD-PLAN.md §6.9, §21 C1, C5; ADR 0019.
 *
 * The payment-method choice lives here as well as in `PaymentSheet`, allowing
 * the cashier to see the same authoritative, method-specific price before
 * opening payment. Both surfaces receive totals from the shared tax engine.
 *
 * Every action here — Void, Take Order/Save Order, Finalize order — is
 * disabled on an empty cart (defect C1). The system this replaces shows
 * `Grand Total Rs. 1` — the POS fee, charged for nothing — with finalize
 * enabled, and the engine's `EmptyOrderError` refuses the same thing on the
 * server side.
 */
export interface CartProps {
  readonly deliveryAddress?: string;
  readonly deliveryChargeInput?: string;
  readonly onDeliveryAddressChange?: (value: string) => void;
  readonly onDeliveryChargeChange?: (value: string) => void;
  readonly lines: readonly CartLine[];
  readonly subtotal: Paisa;
  readonly totals?: Totals | null;
  readonly paymentMethod?: PaymentMethod;
  readonly onPaymentMethodChange?: (method: PaymentMethod) => void;
  readonly discount: Paisa;
  readonly discountReason: string | null;
  readonly serviceChargeBpsOverride?: number | null;
  readonly defaultServiceChargeBps?: number;
  readonly defaultServiceChargeEnabled?: boolean;
  readonly onServiceChargeChange?: (rateBps: number | null) => void;
  readonly tableLabel: string | null;
  readonly guestCount: number | null;
  readonly orderNo: number;
  /** ADR 0016 — null shows as "Walk-in Customer"; both are printed on the tax invoice when set. */
  readonly customerName: string | null;
  readonly customerPhone: string | null;
  readonly onEditCustomer: () => void;
  readonly canDiscount: boolean;
  readonly onQtyChange: (key: string, delta: number) => void;
  /** Fast-billing Qty field — commits an absolute value, not a step. */
  readonly onSetQty: (key: string, qty: number) => void;
  /**
   * The cart line whose Qty field should take focus (and have its value
   * selected) right now — set the moment `ProductSearch`/`ItemGrid` adds a
   * line with no size/modifier choice to make. A new object identity on
   * every call, deliberately: adding the same item twice in a row reuses the
   * same line key, and the field still needs to refocus and reselect the
   * second time.
   */
  readonly qtyFocus: { readonly key: string } | null;
  /** Qty confirmed with `Enter` (or the field lost focus) — hand focus back to Search. */
  readonly onQtyConfirmed: () => void;
  readonly onRemove: (key: string) => void;
  readonly onPickTable: () => void;
  readonly onDiscount: () => void;
  readonly onRemoveDiscount: () => void;
  /** Books the cart as a real order — BUILD-PLAN.md §6.9's send, made an explicit action instead of a side effect of Finalize. Also true for re-booking an order this screen already loaded, at which point the button reads "Save Order" instead (`isBookedOrder`). */
  readonly onTakeOrder: () => void;
  /** True once this screen holds a booked order — just booked this session, or loaded back in via "Load order". Swaps the button from "Take Order" to "Save Order". */
  readonly isBookedOrder: boolean;
  /** True while `onTakeOrder`'s booking request is in flight — disables the button so a double tap cannot book the same round twice. */
  readonly takingOrder: boolean;
  readonly orderType: OrderType;
  readonly onOrderTypeChange: (type: OrderType) => void;
  readonly onOpenOrders: () => void;
  readonly onVoid: () => void;
  readonly canVoid: boolean;
  readonly onPrintKot?: () => void;
  readonly onViewBill?: () => void;
  readonly onFinalize: () => void;
  readonly finalizing: boolean;
}

export function Cart({
  lines,
  subtotal,
  totals = null,
  discount,
  discountReason,
  deliveryAddress = '',
  deliveryChargeInput = '',
  onDeliveryAddressChange,
  onDeliveryChargeChange,
  serviceChargeBpsOverride = null,
  defaultServiceChargeBps = 0,
  defaultServiceChargeEnabled = false,
  onServiceChargeChange = () => {},
  tableLabel,
  guestCount,
  orderNo,
  customerName,
  customerPhone,
  onEditCustomer,
  canDiscount,
  onQtyChange,
  onSetQty,
  qtyFocus,
  onQtyConfirmed,
  onRemove,
  onDiscount,
  onRemoveDiscount,
  onTakeOrder,
  isBookedOrder,
  takingOrder,
  orderType,
  onOrderTypeChange,
  onOpenOrders,
  onVoid,
  canVoid,
  onPrintKot = () => {},
  onViewBill = () => {},
  onFinalize,
  finalizing,
}: CartProps) {
  const empty = lines.length === 0;
  const hasTax = totals !== null && totals.taxLines.length > 0;

  // Local edit buffers, keyed by line — a line not present here still shows
  // its committed `qty`. Kept out of `lines` itself so a half-typed quantity
  // never leaks into the subtotal until `Enter`/blur commits it.
  const [editing, setEditing] = useState<Record<string, string>>({});
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    if (qtyFocus === null) return;
    qtyRefs.current[qtyFocus.key]?.focus();
  }, [qtyFocus]);

  const commitQty = (key: string, fallback: number) => {
    const raw = editing[key];
    setEditing((current) => {
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    if (raw === undefined) return;
    const parsed = Number.parseInt(raw, 10);
    onSetQty(key, Number.isFinite(parsed) && parsed > 0 ? parsed : fallback);
  };

  return (
    <aside className="border-border bg-surface-raised flex h-full flex-col border-s">
      <header className="border-border shrink-0 space-y-2 border-b px-4 py-3">
        {orderType === 'DELIVERY' && (
          <div className="space-y-2">
            <label className="block text-sm">
              Delivery address
              <textarea
                aria-label="Delivery address"
                required
                maxLength={1000}
                rows={2}
                value={deliveryAddress}
                onChange={(event) => onDeliveryAddressChange?.(event.target.value)}
                className="border-border bg-surface w-full rounded border p-2"
              />
            </label>
            <label className="block text-sm">
              Delivery charges (Rs., optional)
              <input
                aria-label="Delivery charges"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={deliveryChargeInput}
                onChange={(event) => onDeliveryChargeChange?.(event.target.value)}
                className="border-border bg-surface w-full rounded border p-2"
              />
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Order #{orderNo}</span>
          {orderType === 'DINE_IN' && (
            <span className="text-ink-muted inline-flex items-center gap-1.5 rounded-base px-2 py-1 text-sm">
              <Users aria-hidden="true" className="size-4" />
              {tableLabel === null ? 'No table available' : `${tableLabel} · Auto-selected`}
              {guestCount !== null && <span className="tabular-nums">· {guestCount} guests</span>}
            </span>
          )}
          <button
            type="button"
            onClick={onEditCustomer}
            className="text-ink-muted hover:text-ink inline-flex items-center gap-1.5 rounded-base px-2 py-1 text-sm underline underline-offset-4"
          >
            <User aria-hidden="true" className="size-4" />
            {customerName ?? 'Walk-in Customer'}
            {customerPhone !== null && <span>· {customerPhone}</span>}
          </button>
        </div>
        <SegmentedControl
          label="Order type"
          size="sm"
          value={orderType}
          onChange={onOrderTypeChange}
          options={ORDER_TYPE_OPTIONS}
        />

        {orderType === 'DINE_IN' && (
          <ServiceChargeControl
            key={serviceChargeBpsOverride === null ? 'default' : serviceChargeBpsOverride}
            overrideBps={serviceChargeBpsOverride}
            defaultBps={defaultServiceChargeBps}
            defaultEnabled={defaultServiceChargeEnabled}
            onChange={onServiceChargeChange}
          />
        )}
      </header>

      {/* `min-h-0` is what makes this the element that gives way. A flex
          child defaults to `min-height: auto` and so refuses to shrink below
          its content; without it the browser takes the space out of the
          footer instead, and the footer is where every total and the finalize
          button live — the "Express checkout" hint below them was being cut
          off by the bottom of the viewport. */}
      {/* The cart is on the far side of the terminal from the grid the
          cashier is tapping, so a screen-reader user gets no confirmation
          that a tap landed. Re-rendering this region's text is what makes the
          announcement — no effect and no message queue needed, because the
          text is derived from the same props the list below renders. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {empty
          ? 'Order is empty.'
          : `${lines.reduce((count, line) => count + line.qty, 0)} items on this order, total ${
              totals === null ? '' : formatPaisa(totals.grandTotal, { symbol: 'Rs.' })
            }`}
      </p>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {empty ? (
          <EmptyState
            title="Nothing on this order yet"
            description="Tap an item to start. An empty order cannot be finalized."
            icon={ReceiptText}
          />
        ) : (
          <ul className="divide-border divide-y">
            {lines.map((line) => (
              <li
                key={line.key}
                className="hover:bg-surface-sunken/60 flex items-start gap-2 px-3 py-2 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium break-words">{lineLabel(line)}</p>
                  {line.modifiers.length > 0 && (
                    <p className="text-ink-muted text-xs">
                      {line.modifiers.map((modifier) => modifier.name).join(', ')}
                    </p>
                  )}
                  {line.note !== null && (
                    <p className="text-warn text-xs font-medium">Note: {line.note}</p>
                  )}
                  {line.seatNo !== null && (
                    <p className="text-ink-subtle text-xs">Seat {line.seatNo}</p>
                  )}
                  <p className="text-ink-subtle text-xs">
                    <Money value={unitPriceOf(line.item, line.variant)} trimWholeRupees /> each
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <IconButton
                    icon={Minus}
                    label={`One fewer ${lineLabel(line)}`}
                    size="sm"
                    onClick={() => onQtyChange(line.key, -1)}
                  />
                  <input
                    ref={(el) => {
                      qtyRefs.current[line.key] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    aria-label={`Quantity for ${lineLabel(line)}`}
                    value={editing[line.key] ?? String(line.qty)}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => {
                      const digits = event.target.value.replace(/\D/g, '');
                      setEditing((current) => ({ ...current, [line.key]: digits }));
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      commitQty(line.key, line.qty);
                      onQtyConfirmed();
                    }}
                    onBlur={(event) => {
                      commitQty(line.key, line.qty);
                      // A touch till's on-screen numeric keypad dismisses on
                      // "Done"/the checkmark without ever firing the `Enter`
                      // keydown above — only this blur — and leaves
                      // `relatedTarget` null because focus went nowhere in
                      // the document. Hand it back to Search in that case,
                      // same as the real-keyboard path. A blur to another
                      // control the cashier actually tapped (another Qty
                      // field, Discount, an item) sets `relatedTarget` and is
                      // left alone — that is the cashier's own navigation.
                      if (event.relatedTarget === null) onQtyConfirmed();
                    }}
                    className="border-border bg-surface w-9 rounded-base border py-0.5 text-center text-sm tabular-nums"
                  />
                  <IconButton
                    icon={Plus}
                    label={`One more ${lineLabel(line)}`}
                    size="sm"
                    onClick={() => onQtyChange(line.key, 1)}
                  />
                </div>

                <div className="w-20 shrink-0 text-end text-sm">
                  <Money
                    value={
                      (unitPriceOf(line.item, line.variant) * BigInt(line.qty) +
                        line.modifiers.reduce(
                          (total, modifier) => total + modifier.priceDelta,
                          0n,
                        )) as Paisa
                    }
                  />
                </div>

                <IconButton
                  icon={Trash2}
                  tone="ghost"
                  size="sm"
                  label={`Remove ${lineLabel(line)}`}
                  onClick={() => onRemove(line.key)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="border-border shrink-0 space-y-3 border-t px-4 py-3">
        {discount !== 0n && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-muted">
              Discount{discountReason === null ? '' : ` · ${discountReason}`}
            </span>
            <div className="flex items-center gap-1">
              <Money value={discount} emphasis="muted" />
              <IconButton
                icon={X}
                tone="ghost"
                size="sm"
                label="Remove discount"
                onClick={onRemoveDiscount}
              />
            </div>
          </div>
        )}

        <dl className="border-border bg-surface-sunken space-y-1 rounded-base border p-3 text-sm shadow-sm">
          {/* Not a control — the outlet takes cash and nothing else, so this
              states the fact rather than offering a choice. It used to be a
              full-width green banner above Finalize, which read as a second
              primary action and drew taps away from the real one. */}
          <div className="text-ink-muted flex items-baseline justify-between gap-3">
            <dt className="inline-flex items-center gap-1.5">
              <Banknote aria-hidden="true" className="size-4" />
              Paid by
            </dt>
            <dd className="font-medium">Cash</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt>{hasTax ? 'Subtotal (ex tax)' : 'Subtotal'}</dt>
            <dd>
              <Money value={totals?.subtotal ?? subtotal} />
            </dd>
          </div>
          {totals !== null && (
            <>
              {totals.discountTotal !== 0n && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt>Discount</dt>
                  <dd>
                    −<Money value={totals.discountTotal} />
                  </dd>
                </div>
              )}
              {totals.taxLines.map((taxLine, index) => (
                <div
                  key={`${taxLine.paymentMethodScope}-${taxLine.taxClass}-${index}`}
                  className="flex items-baseline justify-between gap-3"
                >
                  <dt>
                    Sales tax @ {formatRate(taxLine.rateBps)} (
                    {PAYMENT_METHOD_LABELS[taxLine.paymentMethodScope].toLowerCase()})
                  </dt>
                  <dd>
                    <Money value={taxLine.amount} />
                  </dd>
                </div>
              ))}
              {totals.deliveryCharge !== undefined && totals.deliveryCharge > 0n && (
                <div className="flex justify-between text-sm">
                  <span>Delivery charges</span>
                  <Money value={totals.deliveryCharge} />
                </div>
              )}
              {totals.serviceCharge !== 0n && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt>Service charge</dt>
                  <dd>
                    <Money value={totals.serviceCharge} />
                  </dd>
                </div>
              )}
              {totals.posFee !== 0n && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt>POS service fee</dt>
                  <dd>
                    <Money value={totals.posFee} />
                  </dd>
                </div>
              )}
              {totals.roundingAdj !== 0n && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt>Rounding</dt>
                  <dd>
                    <Money value={totals.roundingAdj} />
                  </dd>
                </div>
              )}
              <div className="border-border mt-2 flex items-baseline justify-between gap-3 border-t border-dashed pt-2 text-lg font-semibold">
                <dt>
                  {hasTax
                    ? totals.discountTotal === 0n
                      ? 'Subtotal including tax'
                      : 'Subtotal including tax & discount'
                    : 'Total'}
                </dt>
                <dd>
                  <Money
                    value={totals.grandTotal}
                    symbol="Rs."
                    emphasis="strong"
                    className="text-2xl"
                    label={
                      hasTax
                        ? 'Total including tax, discount and fees'
                        : 'Total including discount and fees'
                    }
                  />
                </dd>
              </div>
            </>
          )}
        </dl>

        {/* Three tiers, in the order a cashier needs them. Adjust the order,
            then manage it, then take the money. The row that used to hold
            Finalize also held View bill and a Print KOT icon at the same
            width, so the highest-frequency action on the terminal was one of
            three things to read rather than the obvious one. */}
        <div className="grid grid-cols-3 gap-2">
          <Button icon={Percent} onClick={onDiscount} disabled={empty || !canDiscount}>
            Discount
          </Button>
          <Button icon={ReceiptText} onClick={onViewBill} disabled={empty || finalizing}>
            View bill
          </Button>
          <Button
            icon={ChefHat}
            aria-label="Print KOT"
            onClick={onPrintKot}
            disabled={empty || finalizing}
          >
            KOT
          </Button>
        </div>

        <div className="border-border bg-surface-sunken grid grid-cols-3 gap-2 rounded-lg border p-2">
          {/* Void is the only destructive action on this surface, and the
              brand primary is also red (--c-primary and --c-danger resolve to
              the same family for this client). A filled red destructive button
              beside a filled red confirm button is the defect V4 was about, so
              this one carries its red in the text and icon only. */}
          <Button
            className="text-danger hover:bg-danger-soft hover:text-danger min-h-12"
            tone="ghost"
            icon={Ban}
            onClick={onVoid}
            disabled={!canVoid}
          >
            Void
          </Button>
          <Button className="min-h-12 shadow-sm" icon={ClipboardList} onClick={onOpenOrders}>
            Booked Orders
          </Button>
          <Button
            className="min-h-12 shadow-sm"
            icon={ClipboardCheck}
            onClick={onTakeOrder}
            disabled={empty || takingOrder}
          >
            {takingOrder
              ? isBookedOrder
                ? 'Saving…'
                : 'Booking…'
              : isBookedOrder
                ? 'Save Order'
                : 'Take Order'}
          </Button>
        </div>

        {/* The amount is in the button because that is where the cashier is
            already looking when they commit, and because a finalize is
            irreversible under R5 — the figure being charged should not require
            a second glance up the panel to confirm. */}
        <Button
          className="min-h-14 font-semibold shadow-md"
          tone="primary"
          size="lg"
          block
          icon={Wallet}
          onClick={onFinalize}
          disabled={empty || finalizing}
        >
          {finalizing ? (
            'Finalizing…'
          ) : (
            <>
              Finalize order
              {totals !== null && (
                <>
                  {' · '}
                  <Money value={totals.grandTotal} symbol="Rs." />
                </>
              )}
            </>
          )}
        </Button>

        <p className="text-ink-subtle text-center text-xs">
          Express checkout: Ctrl + S or Ctrl + Enter
        </p>
      </footer>
    </aside>
  );
}

function ServiceChargeControl({
  overrideBps,
  defaultBps,
  defaultEnabled,
  onChange,
}: {
  readonly overrideBps: number | null;
  readonly defaultBps: number;
  readonly defaultEnabled: boolean;
  readonly onChange: (rateBps: number | null) => void;
}) {
  const [customPercent, setCustomPercent] = useState(
    overrideBps !== null && overrideBps > 0 ? String(overrideBps / 100) : String(defaultBps / 100),
  );
  const mode = overrideBps === null ? 'DEFAULT' : overrideBps === 0 ? 'OFF' : 'CUSTOM';
  const applyCustom = () => {
    const bps = Math.round(Number(customPercent) * 100);
    if (Number.isFinite(bps) && bps >= 0 && bps <= 10_000) onChange(bps);
  };

  return (
    <section className="border-border rounded-base border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Service charge</p>
          <p className="text-ink-muted text-xs">
            Outlet default: {defaultEnabled ? `${defaultBps / 100}%` : 'Off'}
          </p>
        </div>
        <SegmentedControl
          label="Service charge mode"
          size="sm"
          value={mode}
          onChange={(next) => {
            if (next === 'DEFAULT') onChange(null);
            else if (next === 'OFF') onChange(0);
            else applyCustom();
          }}
          options={[
            { value: 'DEFAULT' as const, label: 'Default' },
            { value: 'OFF' as const, label: 'Off' },
            { value: 'CUSTOM' as const, label: 'Custom' },
          ]}
        />
      </div>
      {mode === 'CUSTOM' && (
        <TextField
          label="Custom service charge (%)"
          value={customPercent}
          onChange={(event) => setCustomPercent(event.target.value)}
          onBlur={applyCustom}
          inputMode="decimal"
          help="Applied only to this invoice."
        />
      )}
    </section>
  );
}
