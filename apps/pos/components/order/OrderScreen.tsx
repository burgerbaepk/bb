'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog, Money, useToast } from '@natech/ui';
import type { BrandConfig } from '@natech/branding';
import { Printer } from 'lucide-react';
import {
  computeTotals,
  linesSubtotal,
  paisa,
  priceLines,
  whole,
  type Paisa,
  type TaxPolicy,
  type TaxRule,
} from '@natech/domain';
import type {
  FloorTable,
  Invoice,
  Order,
  OrderType,
  OutletConfig,
  PaymentSliceDraft,
  PaymentMethod,
  PrintPath,
  Zone,
} from '@natech/contracts';
import { toPaisaWire, toQtyWire } from '@natech/contracts';
import type { Menu } from '@natech/contracts';
import { CategoryStrip } from './CategoryStrip';
import { ItemGrid } from './ItemGrid';
import { ItemOptionsSheet } from './ItemOptionsSheet';
import { ProductSearch, type ProductSearchHandle } from './ProductSearch';
import { Cart } from './Cart';
import { CustomerDialog } from './CustomerDialog';
import { DiscountDialog } from './DiscountDialog';
import { PinConfirmDialog } from './PinConfirmDialog';
import { OrdersQueueDialog } from './OrdersQueueDialog';
import { PaymentSheet } from '@/components/payment/PaymentSheet';
import { TaxInvoiceReceipt } from '@/components/receipt/TaxInvoiceReceipt';
import { TaxInvoicePrintPortal } from '@/components/receipt/TaxInvoicePrintPortal';
import { BillPreviewReceipt } from '@/components/receipt/BillPreviewReceipt';
import { KitchenOrderTicketPrintPortal } from '@/components/receipt/KitchenOrderTicketPrintPortal';
import { BillPreviewPrintPortal } from '@/components/receipt/BillPreviewPrintPortal';
import {
  placeOrderAction,
  recordBillPrintAction,
  setOrderCustomerAction,
  setOrderDiscountAction,
  setServiceChargeOverrideAction,
  setDeliveryDetailsAction,
  voidOrderAction,
  voidOrderLinesAction,
} from '@/lib/orders/actions';
import type { ExistingOrderSummary } from '@/lib/orders/queries';
import { finalizeOrderAction } from '@/lib/payments/actions';
import { printBufferViaBridge, printBufferViaWebUsb } from '@/lib/printing/client';
import { useOffline } from '@/lib/offline/OfflineProvider';
import { buildQueuedOrder } from '@/lib/offline/buildQueuedOrder';
import {
  addToCart,
  cartLineKey,
  changeQty,
  lineFromOrderLine,
  markSent,
  removeLine,
  setQty,
  toDomainCartLines,
  unitPriceOf,
  unsentLines,
  type CartLine,
} from './cartModel';

/**
 * The order screen — BUILD-PLAN.md §6.2, §6.9, §18 M04;
 * docs/runfiles/M10-check-and-payment.md; ADR 0019.
 *
 * M04 walked the whole §6.2 flow on mock data. M10 replaced most of it with a
 * real server action, `finalizeOrderAction`. ADR 0019 removed the pre-payment
 * check entirely: an order goes straight from `SERVED` to the payment sheet,
 * and the tax invoice `finalizeOrderAction` writes is the first and only
 * printed document. `realOrder` is the one piece of state that makes this
 * possible: once a real order exists (placed this session, or loaded via
 * `?orderId=`/`?tableId=`), payment/finalize operates on *that* — never on
 * the client's own cart lines, which are empty for an order loaded fresh
 * without a new round added (M09b §3's own "read-only summary, not a
 * reconstructed cart" decision).
 */
function deliveryChargeText(value: bigint): string {
  return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
}

export interface OrderScreenProps {
  readonly outlet: OutletConfig;
  readonly menu: Menu;
  readonly menuImageUrls: Readonly<Record<string, string | null>>;
  readonly zones: readonly Zone[];
  readonly tables: readonly FloorTable[];
  readonly orderNo: number;
  readonly canDiscount: boolean;
  /**
   * §9.3/§11.3 (M09b) — the table this screen opened against, from
   * `?tableId=`/`?orderId=`. Pre-selects the cart's table without re-seating
   * it (the floor plan/tray already resolved a real table_session before
   * landing here).
   */
  readonly initialTable: FloorTable | null;
  /**
   * The one open order already on that table/id, if any — shown read-only
   * above the live cart; a send from here reuses its id as `existingOrderId`
   * (docs/runfiles/M09b-floor-live.md §3 — a second round, not a
   * reconstructed cart).
   */
  readonly existingOrder: ExistingOrderSummary | null;
  /** The same order, in full (`lib/orders/pricing.ts`) — what payment/finalize actually operate on. Null exactly when `existingOrder` is. */
  readonly serverOrder: Order | null;
  /** `?action=pay` auto-opens the payment sheet on mount; `TAKE_PAYMENT` lands here from the floor plan and the tray. */
  readonly initialAction: 'pay' | null;
  readonly taxPolicy: TaxPolicy;
  readonly taxRules: readonly TaxRule[];
  readonly activePrintPath: PrintPath;
  /** §15.1 — `receipt.showUrdu`, read server-side (`readBrandConfig()`) and passed down, same posture as `taxPolicy`. */
  readonly showUrdu: boolean;
  readonly receiptWidthMm: 58 | 80;
  readonly receiptHeaderLines: readonly string[];
  readonly receiptFooterLines: readonly string[];
  readonly storefrontUrl?: string | null | undefined;
  readonly receiptPaymentDetails: BrandConfig['receipt']['paymentDetails'];
}

/** The real order this session placed — null until the first successful send. */
interface PlacedOrder {
  readonly id: string;
  readonly orderNo: number;
}

export function OrderScreen({
  outlet,
  menu,
  menuImageUrls,
  zones,
  tables,
  orderNo,
  canDiscount,
  initialTable,
  existingOrder,
  serverOrder,
  initialAction,
  taxPolicy,
  taxRules,
  activePrintPath,
  showUrdu,
  receiptWidthMm,
  receiptHeaderLines,
  receiptFooterLines,
  receiptPaymentDetails,
  storefrontUrl,
}: OrderScreenProps) {
  const toast = useToast();
  const router = useRouter();
  const { isOffline, terminalId, terminalLabel, queueOrder } = useOffline();

  const [categoryId, setCategoryId] = useState<string | null>(null);
  // "Load order" (Booked Orders, 2026-08-27) — a loaded order's already-sent
  // lines hydrate straight into the editable cart via `lineFromOrderLine`,
  // rather than staying a read-only summary above an empty round. Voided
  // lines are excluded; there is nothing left on them to edit or re-void.
  const [lines, setLines] = useState<readonly CartLine[]>(() =>
    (serverOrder?.lines ?? []).filter((line) => line.voidReason === null).map(lineFromOrderLine),
  );
  const [pickingItem, setPickingItem] = useState<Menu['items'][number] | null>(null);
  // Fast keyboard billing — the restaurant's keyboard-entry billing brief.
  // `searchRef` is how the Qty field hands focus back to Search once a
  // quantity is confirmed; `qtyFocus` is how a quick-add hands focus the
  // other way, to the line it just created.
  const searchRef = useRef<ProductSearchHandle>(null);
  const [qtyFocus, setQtyFocus] = useState<{ key: string } | null>(null);
  const automaticTable =
    serverOrder === null
      ? (initialTable ?? tables.find((candidate) => candidate.status === 'FREE') ?? null)
      : initialTable;
  // A new counter order starts as takeaway. The first free table is only
  // applied when the cashier explicitly switches to Dine-in; an order opened
  // from the floor still keeps its requested table.
  const [table, setTable] = useState<FloorTable | null>(initialTable);
  const [guestCount, setGuestCount] = useState<number | null>(existingOrder?.guestCount ?? null);
  // ADR 0016 — seeded from `serverOrder` the same way `guestCount` is;
  // `existingOrder` (the tray's own lighter summary) carries no customer
  // fields, so this reads `serverOrder` directly instead.
  const [customerName, setCustomerName] = useState<string | null>(
    serverOrder?.customerName ?? null,
  );
  const [customerPhone, setCustomerPhone] = useState<string | null>(
    serverOrder?.customerPhone ?? null,
  );
  const [deliveryAddress, setDeliveryAddress] = useState(serverOrder?.deliveryAddress ?? '');
  const [deliveryChargeInput, setDeliveryChargeInput] = useState(
    deliveryChargeText(serverOrder?.deliveryCharge ?? 0n),
  );
  const validDeliveryCharge =
    deliveryChargeInput.trim() === '' || /^\d{1,7}(\.\d{1,2})?$/.test(deliveryChargeInput);
  const deliveryCharge = paisa(
    validDeliveryCharge && Number(deliveryChargeInput || '0') <= 1000000
      ? BigInt((deliveryChargeInput.trim() || '0').split('.')[0] ?? '0') * 100n +
          BigInt(((deliveryChargeInput.trim() || '0').split('.')[1] ?? '').padEnd(2, '0'))
      : 0n,
  );
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [customerSaving, setCustomerSaving] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [discount, setDiscount] = useState<Paisa>(paisa(0n));
  const [discountReason, setDiscountReason] = useState<string | null>(null);
  const [serviceChargeBpsOverride, setServiceChargeBpsOverride] = useState<number | null>(
    serverOrder?.serviceChargeBpsOverride ?? null,
  );
  // Explicit dine-in/takeaway/delivery pick. A real loaded order's own type
  // is authoritative (`serverOrder`, e.g. a DELIVERY order reopened with no
  // table); a fresh draft falls back to whether it opened against a table,
  // the same posture `order.type` derived implicitly before this milestone.
  // Picking a table always forces DINE_IN (`TablePickerSheet.onSelect`
  // below); picking takeaway/delivery clears any table, since neither has one.
  const [orderType, setOrderType] = useState<OrderType>(
    serverOrder?.type ?? (initialTable === null ? 'TAKE_AWAY' : 'DINE_IN'),
  );

  const [discountOpen, setDiscountOpen] = useState(false);
  const [ordersQueueOpen, setOrdersQueueOpen] = useState(false);
  const [ordersQueueRevision, setOrdersQueueRevision] = useState(0);
  const [voidPromptOpen, setVoidPromptOpen] = useState(false);
  const [voidPending, setVoidPending] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [clearDraftPromptOpen, setClearDraftPromptOpen] = useState(false);

  // M10 — the order payment/finalize actually run against. Seeded from a
  // real DB read (`serverOrder`) when this screen opened on an existing
  // order; otherwise null until the first `placeOrderAction` call returns one.
  const [realOrder, setRealOrder] = useState<Order | null>(serverOrder);
  const [baselineOrder, setBaselineOrder] = useState<Order | null>(serverOrder);
  const [takingOrder, setTakingOrder] = useState(false);
  // Save Order, when it needs to touch an already-sent line — BUILD-PLAN.md
  // §11.3's PIN+reason bar for anything that undoes an already-placed line,
  // applied here to whichever lines the cashier actually changed (below).
  const [savePinPrompt, setSavePinPrompt] = useState<{
    readonly lineIds: readonly string[];
    readonly replacements: readonly CartLine[];
  } | null>(null);
  const [savePinPending, setSavePinPending] = useState(false);
  const [savePinError, setSavePinError] = useState<string | null>(null);

  const [paymentOpen, setPaymentOpen] = useState(initialAction === 'pay');
  const [kotPrintRequest, setKotPrintRequest] = useState<{ order: Order; printedAt: Date } | null>(
    null,
  );
  const [billOpen, setBillOpen] = useState(false);
  const [billPrintRequested, setBillPrintRequested] = useState(false);
  const [paymentMethod] = useState<PaymentMethod>('CASH');
  const [finalizing, setFinalizing] = useState(false);
  const [finalized, setFinalized] = useState<Invoice | null>(null);
  // §8 — set once `handleFinalize`'s offline branch runs; distinguishes a
  // provisional invoice (no `local_no` yet) from a real one for `offline`'s
  // sake below, since `finalized` alone cannot tell the two apart.
  const [finalizedOffline, setFinalizedOffline] = useState(false);
  const [invoicePrintRequest, setInvoicePrintRequest] = useState<{
    token: number;
    invoice: Invoice;
    order: Order;
  } | null>(null);

  // The order-placement slice. `clientOrderUuid` is minted once per screen
  // mount and reused on every round (§8's idempotency guarantee on
  // `orders.client_order_uuid`); `placedOrder` is null until the first
  // successful placement, after which every further round reuses its id.
  // Placement itself (`sendUnsentLines`, below) now runs automatically ahead
  // of whichever real action needs it — Print Receipt or Finalize — rather
  // than behind its own button. M09b — arriving via `?tableId=`/`?orderId=`
  // onto an order that already exists seeds this immediately, so a later
  // round appends through the same `existingOrderId` path M09a already built
  // rather than creating a duplicate order.
  const [clientOrderUuid, setClientOrderUuid] = useState(() => crypto.randomUUID());
  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(
    existingOrder === null ? null : { id: existingOrder.orderId, orderNo: existingOrder.orderNo },
  );
  const invoicePrintTokenRef = useRef(0);
  // The order id this screen actually mounted bound to (`?orderId=`), if
  // any — captured once, so the self-heal effect below can tell "never had a
  // real order to begin with" (a brand new local order — nothing to heal)
  // apart from "had one, and it just stopped resolving" (the case that
  // needs healing). See that effect for why.
  const boundOrderIdRef = useRef(existingOrder?.orderId ?? null);

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const item of menu.items) {
      result[item.categoryId] = (result[item.categoryId] ?? 0) + 1;
    }
    return result;
  }, [menu.items]);

  const visibleItems = useMemo(
    () => menu.items.filter((item) => categoryId === null || item.categoryId === categoryId),
    [menu.items, categoryId],
  );

  /**
   * How many of each menu item the cart holds, for the tile badge. Summed
   * across cart lines, because one item can occupy several lines at once —
   * a different size, a different modifier set, a different seat.
   */
  const inCartQty = useMemo(() => {
    const result: Record<string, number> = {};
    for (const line of lines) result[line.item.id] = (result[line.item.id] ?? 0) + line.qty;
    return result;
  }, [lines]);

  /**
   * The working order — a client-side preview only. `Cart`, the place-order
   * call, and the live subtotal all read this; check/payment/finalize never
   * do (they read `realOrder`, the server's own view — see this file's own
   * doc comment).
   */
  const order: Order = useMemo(
    () => ({
      id: 'draft-order',
      orderNo,
      channel: 'POS',
      type: table === null ? orderType : 'DINE_IN',
      status: 'DRAFT',
      tableId: table?.id ?? null,
      tableCode: table?.code ?? null,
      zoneName: zones.find((zone) => zone.id === table?.zoneId)?.name ?? null,
      tableSessionId: null,
      customerName,
      customerPhone,
      deliveryAddress: orderType === 'DELIVERY' ? deliveryAddress.trim() : null,
      deliveryCharge: orderType === 'DELIVERY' ? deliveryCharge : paisa(0n),
      waiterInitials: null,
      guestCount,
      note: null,
      clientOrderUuid: '00000000-0000-4000-8000-000000000000',
      businessDate: '',
      serviceStartedAt: new Date(),
      openedAt: new Date(),
      orderDiscount: discount,
      discountReason,
      serviceChargeBpsOverride,
      lines: lines.map((line, index) => ({
        id: line.key,
        menuItemId: line.item.id,
        variantId: line.variant?.id ?? null,
        nameSnapshot: line.item.name,
        nameUrSnapshot: line.item.nameUr,
        variantLabel: line.variant?.name ?? null,
        qty: whole(line.qty),
        unitPrice: paisa(line.item.basePrice + (line.variant?.priceDelta ?? 0n)),
        lineDiscount: paisa(0n),
        taxClass: line.item.taxClass,
        seatNo: line.seatNo,
        note: line.note,
        voidReason: null,
        modifiers: line.modifiers.map((modifier) => ({
          id: `${line.key}-mod-${modifier.id}-${index}`,
          modifierId: modifier.id,
          nameSnapshot: modifier.name,
          nameUrSnapshot: modifier.nameUr,
          priceDelta: modifier.priceDelta,
        })),
      })),
    }),
    [
      orderNo,
      table,
      zones,
      guestCount,
      customerName,
      customerPhone,
      deliveryAddress,
      deliveryCharge,
      discount,
      discountReason,
      serviceChargeBpsOverride,
      lines,
      orderType,
    ],
  );

  const subtotal = useMemo(() => linesSubtotal(priceLines(toDomainCartLines(lines))), [lines]);
  const effectiveTaxPolicy = useMemo<TaxPolicy>(() => {
    const activeOrderType = realOrder?.type ?? order.type;
    if (activeOrderType !== 'DINE_IN') return { ...taxPolicy, serviceChargeAppliesTo: [] };
    if (!taxPolicy.serviceChargeAppliesTo.includes('DINE_IN')) return taxPolicy;
    if (serviceChargeBpsOverride === null) return taxPolicy;
    return {
      ...taxPolicy,
      serviceChargeBps: serviceChargeBpsOverride,
      serviceChargeAppliesTo: serviceChargeBpsOverride === 0 ? [] : ['DINE_IN'],
    };
  }, [order.type, realOrder?.type, serviceChargeBpsOverride, taxPolicy]);
  const previewTotals = useMemo(() => {
    if (lines.length === 0) return null;
    return computeTotals({
      lines: toDomainCartLines(lines),
      orderType: realOrder?.type ?? order.type,
      deliveryCharge,
      orderDiscount: discount,
      payments: [{ method: paymentMethod, amount: paisa(0n) }],
      serviceStartedAt: realOrder?.serviceStartedAt ?? order.serviceStartedAt,
      rules: taxRules,
      policy: effectiveTaxPolicy,
    });
  }, [
    lines,
    realOrder?.type,
    realOrder?.serviceStartedAt,
    order.type,
    order.serviceStartedAt,
    discount,
    deliveryCharge,
    paymentMethod,
    taxRules,
    effectiveTaxPolicy,
  ]);

  /**
   * The one real mutation this screen makes to place an order, run
   * automatically ahead of Print Receipt/Finalize rather than behind its own
   * button. Sends only the lines not already sent (`unsentLines`); on
   * success, stamps them `sentAt` and returns the real order id so express
   * checkout does not have to wait for a state update to land first.
   */
  const validateDelivery = () => {
    if (order.type !== 'DELIVERY') return true;
    if (!deliveryAddress.trim() || deliveryAddress.trim().length > 1000) {
      toast.show('error', 'Enter a delivery address (up to 1,000 characters).');
      return false;
    }
    if (!validDeliveryCharge || Number(deliveryChargeInput || '0') > 1000000) {
      toast.show(
        'error',
        'Enter delivery charges between Rs. 0 and Rs. 1,000,000, with up to two decimal places.',
      );
      return false;
    }
    return true;
  };
  const saveDelivery = async (orderId: string) => {
    if (!validateDelivery()) return false;
    if (order.type !== 'DELIVERY' || isOffline) return true;
    try {
      const result = await setDeliveryDetailsAction({
        orderId,
        deliveryAddress: deliveryAddress.trim(),
        deliveryCharge: toPaisaWire(deliveryCharge),
      });
      if (!result.ok) toast.show('error', result.error ?? 'Could not save delivery details.');
      return result.ok;
    } catch {
      toast.show('error', 'Could not save delivery details. Please retry.');
      return false;
    }
  };

  const sendUnsentLines = async (
    source: readonly CartLine[] = lines,
  ): Promise<{ orderId: string; orderNo: number } | null> => {
    if (!validateDelivery()) return null;
    const toSend = unsentLines(source);
    if (toSend.length === 0) {
      if (placedOrder !== null && !(await saveDelivery(placedOrder.id))) return null;
      return placedOrder === null
        ? null
        : { orderId: placedOrder.id, orderNo: placedOrder.orderNo };
    }

    if (isOffline) {
      // §8 — no server is reachable without the same network that is down, so
      // there is nothing to send; lines are marked sent locally so the rest
      // of the cart UI keeps working, and no server round-trip is queued on
      // its own (this runfile's §2/§3 — an offline sale is captured whole, at
      // finalize, not as separate queued steps).
      const sentAt = new Date();
      const next = placedOrder ?? { id: clientOrderUuid, orderNo };
      setPlacedOrder(next);
      setLines((current) =>
        markSent(
          current,
          toSend.map((line) => line.key),
          sentAt,
        ),
      );
      return { orderId: next.id, orderNo: next.orderNo };
    }

    // Caught here, once, rather than in every caller (`finishTakeOrder`,
    // `handleExpressFinalize`, `handleSaveCustomer`, `handleApplyDiscount`) — a
    // rejection here is the server action's own network/transport failure,
    // not a business refusal (those already come back as `{ ok: false }`,
    // handled below unchanged). Previously this threw straight out of every
    // caller's `await sendUnsentLines(...)`, skipping whichever
    // `setTakingOrder(false)`/etc came right after it — the loading flag
    // never cleared and the button stayed
    // stuck disabled with no error shown, even though nothing about the order
    // itself was actually still pending.
    let result: Awaited<ReturnType<typeof placeOrderAction>>;
    try {
      result = await placeOrderAction({
        clientOrderUuid,
        existingOrderId: placedOrder?.id ?? null,
        tableId: table?.id ?? null,
        guestCount,
        orderType: order.type,
        deliveryAddress: order.deliveryAddress ?? null,
        deliveryCharge: toPaisaWire(deliveryCharge),
        serviceChargeBpsOverride,
        note: null,
        lines: toSend.map((line) => ({
          cartKey: line.key,
          menuItemId: line.item.id,
          variantId: line.variant?.id ?? null,
          nameSnapshot: line.item.name,
          nameUrSnapshot: line.item.nameUr,
          variantLabel: line.variant?.name ?? null,
          qty: toQtyWire(whole(line.qty)),
          unitPrice: toPaisaWire(unitPriceOf(line.item, line.variant)),
          taxClass: line.item.taxClass,
          seatNo: line.seatNo,
          note: line.note,
          modifiers: line.modifiers.map((modifier) => ({
            modifierId: modifier.id,
            nameSnapshot: modifier.name,
            nameUrSnapshot: modifier.nameUr,
            priceDelta: toPaisaWire(modifier.priceDelta),
          })),
        })),
      });
    } catch (error) {
      toast.show(
        'error',
        error instanceof Error ? error.message : 'Could not reach the server. Try again.',
      );
      return null;
    }

    if (!result.ok) {
      toast.show('error', result.error);
      return null;
    }

    const sentAt = new Date(result.sentAt);
    setPlacedOrder({ id: result.orderId, orderNo: result.orderNo });
    if (result.tableId !== null) {
      const assignedTable = tables.find((candidate) => candidate.id === result.tableId) ?? null;
      if (assignedTable !== null) setTable(assignedTable);
    }
    setLines((current) => markSent(current, result.sentCartKeys, sentAt));

    return { orderId: result.orderId, orderNo: result.orderNo };
  };

  /**
   * The actual booking mutation, shared by a plain "Take Order"/"Save Order"
   * (no already-sent line touched) and the tail end of the PIN step-up below
   * (some were). Sends whatever in `source` is still unsent, then clears the
   * screen back to blank via `resetOrderState` — same posture as void/
   * finalize, so the terminal is ready for the next customer the moment this
   * order is booked. The order itself stays booked in the background; a
   * cashier gets back to it through "Load order" in the Booked Orders modal
   * (`placedOrder !== null` there is `isBookedOrder`, below), never by this
   * screen staying on it.
   */
  const finishTakeOrder = async (source: readonly CartLine[] = lines) => {
    const wasBooked = placedOrder !== null;
    setTakingOrder(true);
    const sent = await sendUnsentLines(source);
    setTakingOrder(false);
    if (sent === null) return;
    toast.show(
      'success',
      wasBooked ? `Order #${sent.orderNo} saved` : `Order #${sent.orderNo} booked`,
    );
    // Refresh the dialog's background cache now, while the cashier is still
    // reading the success toast, rather than on their later button click.
    setOrdersQueueRevision((revision) => revision + 1);
    resetOrderState();
  };

  /**
   * "Take Order"/"Save Order" — for a freshly loaded booked order, diffs the
   * cart's current lines against `serverOrder.lines` (the DB truth this
   * screen loaded with) to find any already-sent line the cashier removed or
   * changed the quantity of. Changing one is never an in-place qty edit
   * (`lineFromOrderLine`'s own doc comment) — it is voided outright and, if
   * the cashier still wants some of it, a fresh replacement line goes out
   * priced off the *current* menu, exactly like any other new addition. A
   * pure new addition or a pure increase-only round needs none of this and
   * saves with zero extra friction, same as it always has.
   *
   * Voiding an already-placed line requires one confirmation for every
   * changed line in this save rather than one prompt per line.
   * `# ponytail: any touched already-sent line is voided and, if kept,
   * resent whole (never a partial-quantity carry-forward) — simplest correct
   * behaviour; upgrade to a true delta-only resend if that ever actually
   * matters in practice.`
   */
  const handleTakeOrder = async () => {
    if (takingOrder) return;

    const baseline = (baselineOrder?.lines ?? []).filter((line) => line.voidReason === null);
    if (baseline.length === 0) {
      await finishTakeOrder();
      return;
    }

    const changedLineIds: string[] = [];
    const replacements: CartLine[] = [];
    for (const original of baseline) {
      const originalQty = Number(original.qty) / 1000;
      const current = lines.find((line) => line.sentLineId === original.id);
      if (current !== undefined && current.qty === originalQty) continue;

      changedLineIds.push(original.id);
      const keptQty = current?.qty ?? 0;
      if (keptQty <= 0) continue;

      const freshItem = menu.items.find((item) => item.id === original.menuItemId);
      if (freshItem === undefined) {
        toast.show(
          'error',
          `${original.nameSnapshot} is no longer on the menu — remove it instead of changing its quantity.`,
        );
        return;
      }
      const freshVariant =
        original.variantId === null
          ? null
          : (freshItem.variants.find((variant) => variant.id === original.variantId) ?? null);

      replacements.push({
        key: `${original.id}::resend::${crypto.randomUUID()}`,
        item: freshItem,
        variant: freshVariant,
        qty: keptQty,
        modifiers: current?.modifiers ?? [],
        note: current?.note ?? null,
        seatNo: current?.seatNo ?? null,
        sentAt: null,
        sentLineId: null,
      });
    }

    if (changedLineIds.length === 0) {
      await finishTakeOrder();
      return;
    }

    setSavePinError(null);
    setSavePinPrompt({ lineIds: changedLineIds, replacements });
  };

  /** Confirms the destructive change, then finishes the save with the diffed line set. */
  const handleSavePinConfirm = async () => {
    if (savePinPrompt === null || placedOrder === null) return;
    setSavePinPending(true);
    setSavePinError(null);
    const result = await voidOrderLinesAction({
      orderId: placedOrder.id,
      lineIds: [...savePinPrompt.lineIds],
    });
    setSavePinPending(false);

    if (!result.ok) {
      setSavePinError(result.error ?? 'Could not update the order.');
      return;
    }

    const nextLines = [
      ...lines.filter(
        (line) => line.sentLineId === null || !savePinPrompt.lineIds.includes(line.sentLineId),
      ),
      ...savePinPrompt.replacements,
    ];
    setLines(nextLines);
    setSavePinPrompt(null);
    await finishTakeOrder(nextLines);
  };

  /**
   * Attach, change, or clear the order's customer — ADR 0016. Ensures a real
   * order exists first, the same opening move express checkout already
   * makes, so a customer can be added to a brand-new cart before its first
   * send, not only to an order already on the server. Patches `realOrder` in
   * place on success (see this file's own doc comment on `realOrder`/`order`
   * above) so a loaded order's next invoice reflects the edit without a full
   * reload.
   */
  const handleSaveCustomer = async (phone: string, name: string | null) => {
    let orderId = placedOrder?.id ?? realOrder?.id ?? null;
    if (orderId === null) {
      const sent = await sendUnsentLines();
      if (sent === null) {
        toast.show('error', 'Add at least one item before adding a customer.');
        return;
      }
      orderId = sent.orderId;
    }

    setCustomerSaving(true);
    setCustomerError(null);
    const result = await setOrderCustomerAction({ orderId, phone, name });
    setCustomerSaving(false);

    if (!result.ok) {
      setCustomerError(result.error);
      return;
    }
    setCustomerName(result.customerName);
    setCustomerPhone(result.customerPhone);
    setRealOrder((prev) =>
      prev === null
        ? prev
        : { ...prev, customerName: result.customerName, customerPhone: result.customerPhone },
    );
    setCustomerDialogOpen(false);
  };

  /**
   * Apply (or change) the order-level discount — ADR 0017. Local state
   * updates immediately, same optimistic posture as before this fix (the
   * live preview needs it right away, and offline has nowhere to send it
   * yet regardless); this only adds the round-trip that actually persists
   * it, ensuring a real order exists first the same way `handleSaveCustomer`
   * does, so a discount applied before the first send still lands once one
   * exists rather than only living in this screen's memory.
   */
  const handleApplyDiscount = async (amount: Paisa, reason: string) => {
    setDiscount(amount);
    setDiscountReason(reason);
    setDiscountOpen(false);
    toast.show('info', 'Discount applied before tax');

    if (isOffline) return;
    let orderId = placedOrder?.id ?? realOrder?.id ?? null;
    if (orderId === null) {
      const sent = await sendUnsentLines();
      if (sent === null) return;
      orderId = sent.orderId;
    }
    const result = await setOrderDiscountAction({ orderId, amount: toPaisaWire(amount), reason });
    if (!result.ok) toast.show('error', result.error ?? 'Could not save the discount.');
  };

  const handleRemoveDiscount = async () => {
    setDiscount(paisa(0n));
    setDiscountReason(null);

    if (isOffline) return;
    const orderId = placedOrder?.id ?? realOrder?.id ?? null;
    if (orderId === null) return;
    const result = await setOrderDiscountAction({
      orderId,
      amount: toPaisaWire(paisa(0n)),
      reason: null,
    });
    if (!result.ok) toast.show('error', result.error ?? 'Could not remove the discount.');
  };

  const handleServiceChargeChange = async (rateBps: number | null) => {
    setServiceChargeBpsOverride(rateBps);
    setRealOrder((current) =>
      current === null ? current : { ...current, serviceChargeBpsOverride: rateBps },
    );
    if (isOffline) {
      toast.show('info', 'Service charge updated for this offline invoice.');
      return;
    }
    const orderId = placedOrder?.id ?? realOrder?.id ?? null;
    if (orderId === null) return;
    const result = await setServiceChargeOverrideAction({ orderId, rateBps });
    if (!result.ok) toast.show('error', result.error ?? 'Could not update the service charge.');
  };

  const handleRemoveCustomer = async () => {
    const orderId = placedOrder?.id ?? realOrder?.id ?? null;
    if (orderId === null) {
      // Nothing sent yet — clearing local state is enough, there is no
      // server row to clear it on.
      setCustomerName(null);
      setCustomerPhone(null);
      setCustomerDialogOpen(false);
      return;
    }

    setCustomerSaving(true);
    setCustomerError(null);
    const result = await setOrderCustomerAction({ orderId, phone: null, name: null });
    setCustomerSaving(false);

    if (!result.ok) {
      setCustomerError(result.error);
      return;
    }
    setCustomerName(null);
    setCustomerPhone(null);
    setRealOrder((prev) =>
      prev === null ? prev : { ...prev, customerName: null, customerPhone: null },
    );
    setCustomerDialogOpen(false);
  };

  /**
   * Back to a blank order — reused by every place this screen is done with
   * the one it was just holding: a finalize (below), a void, and closing the
   * finalized-invoice dialog. `table`/`guestCount`/
   * `orderType` are deliberately left alone (same table, ready for whatever
   * comes next), the same posture void/finalize already had before this was
   * extracted.
   *
   * Re-mints `clientOrderUuid` rather than leaving the one this screen mounted
   * with: it is a real unique index on `orders.client_order_uuid`, so reusing
   * it for the *next* order this same screen instance sends would fail that
   * insert outright, not silently reuse the old row.
   *
   * Also drops `orderId`/`action` from the address bar (2026-08-27) — `?orderId=`
   * is what `page.tsx` keys this whole screen on, so leaving a voided/finalized
   * id sitting in the URL after this local state has already moved on means a
   * later browser refresh, back button, or unrelated `router.refresh()` (the
   * Booked Orders dialog's own void does one) re-resolves that dead id and
   * hands this screen new props for an order that no longer exists — nothing
   * here re-syncs state from *later* prop changes on its own, only from the
   * ones it mounted with, so without this the next "Take Order" tries to
   * append to a hole where that order used to be and the server correctly,
   * silently refuses (`orderMachine`, VOIDED/FINALIZED are terminal). `replace`,
   * not `push`, so the dead id drops out of history too, not just the bar.
   */
  const resetOrderState = () => {
    setLines([]);
    setCustomerName(null);
    setCustomerPhone(null);
    setDiscount(paisa(0n));
    setDiscountReason(null);
    setServiceChargeBpsOverride(null);
    setDeliveryAddress('');
    setDeliveryChargeInput('');
    setTable(null);
    setGuestCount(null);
    setOrderType('TAKE_AWAY');
    setPlacedOrder(null);
    setRealOrder(null);
    setBaselineOrder(null);
    setClientOrderUuid(crypto.randomUUID());

    // Only touch the URL when it names an order/table that is now stale. A
    // table picked inside a fresh cart was never added to the URL, so booking
    // it must remain a local state reset; navigating to `/?tableId=...` here
    // immediately reran the entire server page and loaded the order we had
    // just cleared, which made Book Order feel like a full-page operation.
    const params = new URLSearchParams(window.location.search);
    const needsUrlCleanup = params.has('orderId') || params.has('tableId') || params.has('action');
    if (needsUrlCleanup) {
      router.replace('/');
    }
  };

  /**
   * Self-heal when the order this screen is bound to disappears out from
   * under it while it is still mounted — the case `resetOrderState`'s own
   * URL cleanup cannot reach, because nothing there ran: the Booked Orders
   * dialog voids independently of this screen, then calls `router.refresh()`
   * on the *same* route, which re-resolves `?orderId=` and hands this
   * mounted instance fresh props (`existingOrder`) without remounting it —
   * `key` in `page.tsx` is keyed on the URL's `orderId`, which has not
   * itself changed, only what it now resolves to.
   *
   * Only fires when this screen actually started on a real order
   * (`boundOrderIdRef`) *and* nothing has already moved `placedOrder` on
   * since — a brand-new local order (never had a `boundOrderIdRef`) or a
   * void this screen already ran itself (`placedOrder` is already null by
   * the time this runs) both fall through untouched.
   */
  useEffect(() => {
    const boundId = boundOrderIdRef.current;
    if (boundId === null) return;
    if (placedOrder?.id !== boundId) return;
    if (existingOrder !== null && existingOrder.orderId === boundId) return;
    resetOrderState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingOrder, placedOrder]);

  /** §12 — dispatch a physical print for the invoice through whichever path Settings selects. HTML_DIALOG is handled by the caller mounting a `PrintPortal`. */
  const dispatchEscPos = (kind: 'invoice', escPosBase64: string | null) => {
    if (activePrintPath === 'HTML_DIALOG' || escPosBase64 === null) return;
    const send = activePrintPath === 'BRIDGE_AGENT' ? printBufferViaBridge : printBufferViaWebUsb;
    void send(escPosBase64).then((result) => {
      if (!result.ok) toast.show('error', result.error ?? `Printing the ${kind} failed.`);
    });
  };

  /** The finalize call itself, run once `PaymentSheet`'s `onFinalize` settles the payment. */
  const handleFinalize = async (slices: readonly PaymentSliceDraft[], explicitOrderId?: string) => {
    const orderId = explicitOrderId ?? placedOrder?.id ?? realOrder?.id ?? null;
    if (orderId === null) {
      toast.show('error', 'There is no order to finalize.');
      return;
    }

    if (!(await saveDelivery(orderId))) {
      setFinalizing(false);
      return;
    }
    if (isOffline) {
      setFinalizing(true);
      try {
        const domainLines = toDomainCartLines(lines);
        const approved = slices.filter((slice) => slice.attemptStatus === 'APPROVED');
        const totals = computeTotals({
          lines: domainLines,
          orderType: order.type,
          deliveryCharge,
          serviceStartedAt: order.serviceStartedAt,
          rules: taxRules,
          policy: effectiveTaxPolicy,
          payments: approved.map((slice) => ({ method: slice.method, amount: slice.amount })),
          // ADR 0017 — the provisional invoice this builds offline needs the
          // same figure `buildQueuedOrder` below already carries for replay.
          orderDiscount: discount,
        });

        const queuedOrder = buildQueuedOrder({
          clientOrderUuid,
          terminalId,
          orderNo: placedOrder?.orderNo ?? orderNo,
          type: order.type,
          tableId: table?.id ?? null,
          guestCount,
          serviceStartedAt: order.serviceStartedAt,
          openedAt: order.openedAt,
          orderDiscount: discount,
          deliveryAddress: order.deliveryAddress ?? null,
          deliveryCharge,
          serviceChargeBpsOverride,
          lines,
          payments: slices,
          clientGrandTotal: totals.grandTotal,
          clientTaxTotal: totals.taxTotal,
        });

        await queueOrder(queuedOrder);

        const invoiceOrder =
          realOrder === null
            ? order
            : {
                ...realOrder,
                deliveryAddress: order.deliveryAddress ?? null,
                deliveryCharge: order.deliveryCharge,
              };
        const provisionalInvoice: Invoice = {
          id: crypto.randomUUID(),
          orderId,
          // §8 — no `local_no` exists until this replays; `TaxInvoiceReceipt`
          // shows `order_no` instead whenever `offline` is set, never this.
          localNo: `${invoiceOrder.orderNo}`,
          businessDate: invoiceOrder.businessDate,
          finalizedAt: new Date(),
          finalizedByName: null,
          terminalLabel,
          status: 'FINALIZED',
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          taxableBase: totals.taxableBase,
          taxTotal: totals.taxTotal,
          deliveryCharge: totals.deliveryCharge ?? paisa(0n),
          serviceCharge: totals.serviceCharge,
          posFee: totals.posFee,
          roundingAdj: totals.roundingAdj,
          grandTotal: totals.grandTotal,
          taxLines: totals.taxLines.map((line, index) => ({
            id: `offline-${index}`,
            taxClass: line.taxClass,
            rateBps: line.rateBps,
            base: line.base,
            amount: line.amount,
            paymentMethodScope: line.paymentMethodScope,
          })),
          payments: slices.map((slice, index) => ({
            id: `offline-${index}`,
            method: slice.method,
            amount: slice.amount,
            tendered: null,
            change: null,
            cardLast4: null,
            terminalRef: null,
            taxRateAppliedBps: null,
            attemptStatus: slice.attemptStatus,
            declinedReason: slice.declinedReason,
            at: new Date(),
          })),
          printedCount: 0,
        };

        setPaymentOpen(false);
        setFinalizedOffline(true);
        setFinalized(provisionalInvoice);
        invoicePrintTokenRef.current += 1;
        setInvoicePrintRequest({
          token: invoicePrintTokenRef.current,
          invoice: provisionalInvoice,
          order: invoiceOrder,
        });
        toast.show('success', 'Sale completed offline — it will sync once the connection returns.');
      } catch (error) {
        toast.show(
          'error',
          error instanceof Error ? error.message : 'Could not complete the sale offline.',
        );
      } finally {
        setFinalizing(false);
      }
      return;
    }

    setFinalizing(true);
    const result = await finalizeOrderAction({
      orderId,
      // `slices` here is `PaymentSliceDraft[]` — `amount` is a real `Paisa`
      // bigint (R1), correct for in-memory state, but the server action
      // boundary needs the wire decimal-string form, same as every other
      // money field crossing it (`sendUnsentLines`'s `unitPrice`/`priceDelta`
      // above).
      slices: slices.map((slice) => ({ ...slice, amount: toPaisaWire(slice.amount) })),
      outlet,
    });
    setFinalizing(false);

    if (!result.ok || result.invoice === null) {
      toast.show('error', result.error ?? 'Finalizing failed.');
      return;
    }

    setPaymentOpen(false);
    setFinalizedOffline(false);
    setFinalized(result.invoice);

    const invoiceOrder =
      realOrder === null
        ? order
        : {
            ...realOrder,
            deliveryAddress: order.deliveryAddress ?? null,
            deliveryCharge: order.deliveryCharge,
          };
    if (activePrintPath === 'HTML_DIALOG') {
      invoicePrintTokenRef.current += 1;
      setInvoicePrintRequest({
        token: invoicePrintTokenRef.current,
        invoice: result.invoice,
        order: invoiceOrder,
      });
    } else {
      dispatchEscPos('invoice', result.escPosBase64);
    }
  };

  /**
   * "View bill" — ADR 0027.
   *
   * Books the order first, if it is not booked already. Until now the bill
   * dialog opened straight off the client-side cart, so an operator could
   * quote a customer a total for a sale the server had never been told about,
   * take the cash, and close the terminal. There would be nothing to
   * reconcile against, because there was no order.
   *
   * Booking first is what makes the sale visible: the order appears in Active
   * Orders and in the Booked Orders queue, and `recordBillPrintAction` can
   * then hang an audit row off a real id. An operator who wants to hand over
   * a total now necessarily leaves a trail, and an order that never becomes an
   * invoice shows up on the exceptions report the next morning with their name
   * against it.
   */
  const handleViewBill = async () => {
    if (previewTotals === null) {
      toast.show('error', 'There is nothing on this order to bill.');
      return;
    }
    let orderId = placedOrder?.id ?? realOrder?.id ?? null;
    if (orderId === null) {
      setTakingOrder(true);
      const sent = await sendUnsentLines(lines);
      setTakingOrder(false);
      // `sendUnsentLines` has already shown the reason. Refusing to open the
      // dialog is the point: no order, no bill.
      if (sent === null) return;
      orderId = sent.orderId;
    }
    setBillOpen(true);
    await recordBillPrintAction({
      orderId,
      grandTotal: toPaisaWire(previewTotals.grandTotal),
      printed: false,
    });
  };

  /**
   * "Print bill" — the paper version of the above, recorded separately.
   *
   * A printed bill is the instrument of the fraud ADR 0027 describes: it is
   * what a customer accepts as proof they have been charged. It is therefore
   * worth distinguishing in the log from a total merely read off the screen,
   * even though both leave a row.
   */
  const handlePrintBill = async () => {
    const orderId = placedOrder?.id ?? realOrder?.id ?? null;
    if (orderId !== null && previewTotals !== null) {
      await recordBillPrintAction({
        orderId,
        grandTotal: toPaisaWire(previewTotals.grandTotal),
        printed: true,
      });
    }
    setBillPrintRequested(true);
  };

  /** One-click cash checkout using the total already shown in the cart. */
  const handleExpressFinalize = async () => {
    if (previewTotals === null) {
      toast.show('error', 'There is no payable total to finalize.');
      return;
    }

    // Give immediate visual feedback while a fresh order is being persisted;
    // previously the button did not enter its loading state until that first
    // server round-trip had already completed.
    setFinalizing(true);
    let orderId = placedOrder?.id ?? realOrder?.id ?? null;
    if (unsentLines(lines).length > 0 || orderId === null) {
      const sent = await sendUnsentLines();
      if (sent === null) {
        setFinalizing(false);
        return;
      }
      orderId = sent.orderId;
    }

    await handleFinalize(
      [
        {
          method: paymentMethod,
          amount: previewTotals.grandTotal,
          attemptStatus: 'APPROVED',
          declinedReason: null,
        },
      ],
      orderId,
    );
  };

  // Fast counter checkout. Both shortcuts intentionally share the exact same
  // path as the visible Finalize button so keyboard and touch sales cannot
  // drift into different payment behavior.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || (event.key !== 's' && event.key !== 'S' && event.key !== 'Enter'))
        return;
      event.preventDefault();
      if (lines.length === 0 || finalizing) return;
      void handleExpressFinalize();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  /**
   * §7.8 — "make the invoice reprintable with full fiscal detail once the
   * numbers land." The cashier is still looking at the dialog that just
   * finalized this invoice; a re-fetch needs no invoice-lookup screen, only
   * the id already held in `finalized`.
   */
  /**
   * Void from the cart's own footer — BUILD-PLAN.md §11.3.
   *
   * Nothing has reached the server for a draft with no `placedOrder` yet, so
   * there is nothing to void there — clearing the local cart is the whole
   * operation. Once a real order exists, this uses the same confirmation as
   * `ActiveOrdersTray`, via `voidOrderAction`.
   */
  const handleVoidClick = () => {
    if (placedOrder === null) {
      setClearDraftPromptOpen(true);
      return;
    }
    if (isOffline) {
      toast.show('error', 'Voiding a placed order needs a connection.');
      return;
    }
    setVoidError(null);
    setVoidPromptOpen(true);
  };

  const handleClearDraft = () => {
    setLines([]);
    setDiscount(paisa(0n));
    setDiscountReason(null);
    setClearDraftPromptOpen(false);
  };

  const handleVoidConfirm = async () => {
    if (placedOrder === null) return;
    setVoidPending(true);
    const result = await voidOrderAction({ orderId: placedOrder.id });
    setVoidPending(false);

    if (!result.ok) {
      setVoidError(result.error ?? 'Voiding failed.');
      return;
    }

    toast.show('success', `Order #${placedOrder.orderNo} voided`);
    setVoidPromptOpen(false);
    resetOrderState();
  };

  /**
   * Pick an item — from the search box, its dropdown, or a grid tap. An item
   * with a size choice or a required modifier still opens `ItemOptionsSheet`
   * (unchanged from before this milestone). Everything else — the whole of
   * this menu, ADR 0012 — skips the dialog entirely: it goes into the cart at
   * qty 1 and `qtyFocus` hands keyboard focus straight to that line's Qty
   * field, selected, ready to be typed over.
   */
  const handlePickItem = (item: Menu['items'][number]) => {
    if (item.variants.length > 0 || item.modifierGroups.length > 0) {
      setPickingItem(item);
      return;
    }
    const key = cartLineKey(item, null, [], null, null);
    setLines((current) =>
      addToCart(current, {
        key,
        item,
        variant: null,
        qty: 1,
        modifiers: [],
        note: null,
        seatNo: null,
        sentAt: null,
        sentLineId: null,
      }),
    );
    setQtyFocus({ key });
  };

  return (
    <div className="grid h-[calc(100dvh-3.5rem)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_26rem]">
      <section className="flex min-h-0 flex-col overflow-hidden">
        <ProductSearch ref={searchRef} items={menu.items} onPick={handlePickItem} />
        <CategoryStrip
          categories={menu.categories}
          counts={counts}
          selectedId={categoryId}
          onSelect={setCategoryId}
        />
        <div className="flex-1 overflow-y-auto">
          <ItemGrid
            items={visibleItems}
            imageUrls={menuImageUrls}
            inCartQty={inCartQty}
            onPick={handlePickItem}
          />
        </div>
      </section>

      <Cart
        lines={lines}
        subtotal={subtotal}
        totals={previewTotals}
        paymentMethod={paymentMethod}
        onPaymentMethodChange={() => {}}
        discount={discount}
        discountReason={discountReason}
        deliveryAddress={deliveryAddress}
        deliveryChargeInput={deliveryChargeInput}
        onDeliveryAddressChange={setDeliveryAddress}
        onDeliveryChargeChange={setDeliveryChargeInput}
        serviceChargeBpsOverride={serviceChargeBpsOverride}
        defaultServiceChargeBps={taxPolicy.serviceChargeBps}
        defaultServiceChargeEnabled={taxPolicy.serviceChargeAppliesTo.includes(
          realOrder?.type ?? order.type,
        )}
        onServiceChargeChange={(rateBps) => void handleServiceChargeChange(rateBps)}
        tableLabel={table === null ? null : `Table ${table.code}`}
        guestCount={guestCount}
        orderNo={orderNo}
        customerName={customerName}
        customerPhone={customerPhone}
        onEditCustomer={() => {
          setCustomerError(null);
          setCustomerDialogOpen(true);
        }}
        canDiscount={canDiscount}
        orderType={table === null ? orderType : 'DINE_IN'}
        onOrderTypeChange={(next) => {
          if (placedOrder !== null || realOrder !== null) {
            toast.show('info', 'Start a new order to change the order type.');
            return;
          }
          if (next === 'DINE_IN') {
            setOrderType('DINE_IN');
            if (table === null) setTable(automaticTable);
            return;
          }
          setOrderType(next);
          setTable(null);
        }}
        onOpenOrders={() => setOrdersQueueOpen(true)}
        onVoid={handleVoidClick}
        canVoid={placedOrder !== null || lines.length > 0}
        onPrintKot={() => {
          if (order.lines.length > 0) setKotPrintRequest({ order, printedAt: new Date() });
        }}
        onViewBill={() => void handleViewBill()}
        onFinalize={() => void handleExpressFinalize()}
        finalizing={finalizing}
        onQtyChange={(key, delta) => setLines((current) => changeQty(current, key, delta))}
        onSetQty={(key, qty) => setLines((current) => setQty(current, key, qty))}
        qtyFocus={qtyFocus}
        onQtyConfirmed={() => {
          // Safari does not reliably honour a `.focus()` call made
          // synchronously inside the very keydown/blur event the Qty field
          // is still processing on its way to losing focus — a documented
          // WebKit quirk, not a jsdom-visible one. Deferring one frame lets
          // Safari finish its own handling of that event first.
          requestAnimationFrame(() => searchRef.current?.focus());
        }}
        onRemove={(key) => setLines((current) => removeLine(current, key))}
        onPickTable={() => {}}
        onDiscount={() => setDiscountOpen(true)}
        onRemoveDiscount={() => void handleRemoveDiscount()}
        onTakeOrder={() => void handleTakeOrder()}
        isBookedOrder={placedOrder !== null}
        takingOrder={takingOrder}
      />

      {pickingItem !== null && (
        <ItemOptionsSheet
          key={pickingItem.id}
          item={pickingItem}
          guestCount={guestCount}
          onClose={() => setPickingItem(null)}
          onAdd={({ item, variant, modifiers, qty, note, seatNo }) => {
            const key = cartLineKey(item, variant, modifiers, seatNo, note);
            setLines((current) =>
              addToCart(current, {
                key,
                item,
                variant,
                qty,
                modifiers,
                note,
                seatNo,
                sentAt: null,
                sentLineId: null,
              }),
            );
          }}
        />
      )}

      <DiscountDialog
        open={discountOpen}
        subtotal={subtotal}
        offline={isOffline}
        onClose={() => setDiscountOpen(false)}
        onApply={(amount, reason) => void handleApplyDiscount(amount, reason)}
      />

      <CustomerDialog
        key={String(customerDialogOpen)}
        open={customerDialogOpen}
        customerName={customerName}
        customerPhone={customerPhone}
        pending={customerSaving}
        error={customerError}
        onClose={() => setCustomerDialogOpen(false)}
        onSave={(phone, name) => void handleSaveCustomer(phone, name)}
        onRemove={() => void handleRemoveCustomer()}
      />

      {/* Existing floor orders can still arrive with `?action=pay`. Normal
          cart finalization uses express checkout and never opens this sheet. */}
      <PaymentSheet
        // The sheet deliberately keeps attempt state while it is visible.
        // Remount for every order/open cycle so a previous order's approved
        // amount can never be submitted against a newly loaded order.
        key={`${(realOrder === null ? order : { ...realOrder, deliveryAddress: order.deliveryAddress ?? null, deliveryCharge: order.deliveryCharge }).id}:${paymentOpen ? 'open' : 'closed'}`}
        open={paymentOpen}
        order={
          realOrder === null
            ? order
            : {
                ...realOrder,
                deliveryAddress: order.deliveryAddress ?? null,
                deliveryCharge: order.deliveryCharge,
              }
        }
        taxPolicy={effectiveTaxPolicy}
        taxRules={taxRules}
        method={paymentMethod}
        onMethodChange={() => {}}
        finalizing={finalizing}
        onClose={() => setPaymentOpen(false)}
        onFinalize={(slices) => void handleFinalize(slices)}
      />

      <Dialog
        open={billOpen && previewTotals !== null}
        onClose={() => setBillOpen(false)}
        title={`Bill preview · Order #${order.orderNo}`}
        description="Review the bill, then charge the customer and create the invoice."
        className="w-[min(30rem,calc(100vw-2rem))]"
        footer={
          <>
            <Button onClick={() => setBillOpen(false)}>Back to order</Button>
            <Button icon={Printer} onClick={() => void handlePrintBill()}>
              Print bill
            </Button>
            <Button
              tone="primary"
              onClick={() => {
                setBillOpen(false);
                void handleExpressFinalize();
              }}
            >
              Charge & invoice ·{' '}
              <Money value={previewTotals?.grandTotal ?? paisa(0n)} symbol="Rs." />
            </Button>
          </>
        }
      >
        {previewTotals !== null && (
          <div className="bg-surface-sunken max-h-[60vh] overflow-y-auto rounded-base p-3">
            <BillPreviewReceipt
              outlet={outlet}
              order={order}
              totals={previewTotals}
              paymentMethod={paymentMethod}
              widthMm={receiptWidthMm}
              showUrdu={showUrdu}
              operatorHeaderLines={receiptHeaderLines}
              operatorFooterLines={receiptFooterLines}
              paymentDetails={receiptPaymentDetails}
            />
          </div>
        )}
      </Dialog>

      {kotPrintRequest !== null && (
        <KitchenOrderTicketPrintPortal
          outlet={outlet}
          order={kotPrintRequest.order}
          printedAt={kotPrintRequest.printedAt}
          widthMm={receiptWidthMm}
          showUrdu={showUrdu}
          onDone={() => setKotPrintRequest(null)}
        />
      )}

      {billPrintRequested && previewTotals !== null && (
        <BillPreviewPrintPortal
          outlet={outlet}
          order={order}
          totals={previewTotals}
          paymentMethod={paymentMethod}
          widthMm={receiptWidthMm}
          showUrdu={showUrdu}
          headerLines={receiptHeaderLines}
          footerLines={receiptFooterLines}
          paymentDetails={receiptPaymentDetails}
          onDone={() => setBillPrintRequested(false)}
        />
      )}

      <FinalizedDialog
        storefrontUrl={storefrontUrl}
        outlet={outlet}
        order={
          realOrder === null
            ? order
            : {
                ...realOrder,
                deliveryAddress: order.deliveryAddress ?? null,
                deliveryCharge: order.deliveryCharge,
              }
        }
        invoice={finalized}
        offline={finalizedOffline}
        activePrintPath={activePrintPath}
        showUrdu={showUrdu}
        widthMm={receiptWidthMm}
        headerLines={receiptHeaderLines}
        footerLines={receiptFooterLines}
        paymentDetails={receiptPaymentDetails}
        onPrintAgain={() => {
          if (finalized === null) return;
          if (finalizedOffline || activePrintPath === 'HTML_DIALOG') {
            invoicePrintTokenRef.current += 1;
            setInvoicePrintRequest({
              token: invoicePrintTokenRef.current,
              invoice: finalized,
              order:
                realOrder === null
                  ? order
                  : {
                      ...realOrder,
                      deliveryAddress: order.deliveryAddress ?? null,
                      deliveryCharge: order.deliveryCharge,
                    },
            });
          }
        }}
        onClose={() => {
          setFinalized(null);
          setFinalizedOffline(false);
          resetOrderState();
        }}
      />

      <PinConfirmDialog
        open={voidPromptOpen}
        title={placedOrder === null ? '' : `Void order #${placedOrder.orderNo}`}
        description="This voids the whole order, including anything still cooking. It cannot be undone from here."
        confirmLabel={voidPending ? 'Voiding…' : 'Void order'}
        pending={voidPending}
        error={voidError}
        onClose={() => setVoidPromptOpen(false)}
        onConfirm={() => void handleVoidConfirm()}
      />

      <PinConfirmDialog
        open={savePinPrompt !== null}
        title={
          savePinPrompt === null
            ? ''
            : `Update ${savePinPrompt.lineIds.length} sent item${savePinPrompt.lineIds.length === 1 ? '' : 's'}`
        }
        description="Removing or changing the quantity of something already sent voids it on the order. It cannot be undone from here."
        confirmLabel={savePinPending ? 'Saving…' : 'Save order'}
        pending={savePinPending}
        error={savePinError}
        onClose={() => setSavePinPrompt(null)}
        onConfirm={() => void handleSavePinConfirm()}
      />

      <Dialog
        open={clearDraftPromptOpen}
        onClose={() => setClearDraftPromptOpen(false)}
        title="Clear this order?"
        description="Nothing on it has been sent yet, so there is nothing to void — this just empties the cart."
        className="w-[min(22rem,calc(100vw-2rem))]"
        footer={
          <>
            <Button onClick={() => setClearDraftPromptOpen(false)}>Cancel</Button>
            <Button tone="danger" onClick={handleClearDraft}>
              Clear order
            </Button>
          </>
        }
      />

      <OrdersQueueDialog
        open={ordersQueueOpen}
        refreshKey={ordersQueueRevision}
        onLoadOrder={(loaded) => {
          const loadedTable =
            loaded.tableId === null
              ? null
              : (tables.find((candidate) => candidate.id === loaded.tableId) ?? null);
          setLines(loaded.lines.filter((line) => line.voidReason === null).map(lineFromOrderLine));
          setTable(loadedTable);
          setGuestCount(loaded.guestCount);
          setCustomerName(loaded.customerName);
          setCustomerPhone(loaded.customerPhone);
          setDiscount(loaded.orderDiscount);
          setDiscountReason(loaded.discountReason);
          setServiceChargeBpsOverride(loaded.serviceChargeBpsOverride);
          setDeliveryAddress(loaded.deliveryAddress ?? '');
          setDeliveryChargeInput(deliveryChargeText(loaded.deliveryCharge ?? 0n));
          setOrderType(loaded.type);
          setPlacedOrder({ id: loaded.id, orderNo: loaded.orderNo });
          setRealOrder(loaded);
          setBaselineOrder(loaded);
          setClientOrderUuid(loaded.clientOrderUuid);
          boundOrderIdRef.current = null;
        }}
        onClose={() => setOrdersQueueOpen(false)}
      />

      {invoicePrintRequest !== null && (
        <TaxInvoicePrintPortal
          storefrontUrl={storefrontUrl}
          key={invoicePrintRequest.token}
          outlet={outlet}
          order={invoicePrintRequest.order}
          invoice={invoicePrintRequest.invoice}
          showUrdu={showUrdu}
          widthMm={receiptWidthMm}
          headerLines={receiptHeaderLines}
          footerLines={receiptFooterLines}
          paymentDetails={receiptPaymentDetails}
          offline={finalizedOffline}
          onDone={() => setInvoicePrintRequest(null)}
        />
      )}
    </div>
  );
}

/**
 * The finalized document — BUILD-PLAN.md §6.2, §7.8.
 *
 * `invoice` is the real row `finalizeOrderAction` wrote — `fiscal: []` and
 * `qrPayload: null` until M11 attempts a real transmission; `TaxInvoiceReceipt`
 * already renders that state correctly (M04's own §7.8 pending-banner path).
 */
function FinalizedDialog({
  outlet,
  order,
  invoice,
  offline,
  activePrintPath,
  showUrdu,
  widthMm,
  headerLines,
  footerLines,
  paymentDetails,
  storefrontUrl,
  onPrintAgain,
  onClose,
}: {
  readonly outlet: OutletConfig;
  readonly order: Order;
  readonly invoice: Invoice | null;
  /** §8 — a sale finalized offline: no `local_no` yet, `refreshInvoiceFiscalAction` unreachable. */
  readonly offline: boolean;
  readonly activePrintPath: PrintPath;
  readonly showUrdu: boolean;
  readonly widthMm: 58 | 80;
  readonly headerLines: readonly string[];
  readonly footerLines: readonly string[];
  readonly storefrontUrl?: string | null | undefined;
  readonly paymentDetails: BrandConfig['receipt']['paymentDetails'];
  readonly onPrintAgain: () => void;
  readonly onClose: () => void;
}) {
  if (invoice === null) return null;

  return (
    <Dialog
      open
      onClose={onClose}
      title="Invoice ready"
      description={
        offline ? 'Completed offline and ready to sync.' : 'Payment complete. The invoice is ready.'
      }
      className="w-[min(30rem,calc(100vw-2rem))]"
      footer={
        <>
          {/* §7.8 — the 1200ms inline attempt can still be catching up moments
              after finalize; offline, there is nothing to ask the server yet. */}
          {(offline || activePrintPath === 'HTML_DIALOG') && (
            <Button icon={Printer} onClick={onPrintAgain}>
              Print again
            </Button>
          )}
          <Button tone="primary" onClick={onClose}>
            Done · <Money value={invoice.grandTotal} symbol="Rs." />
          </Button>
        </>
      }
    >
      <div className="bg-surface-sunken max-h-[60vh] overflow-y-auto rounded-base p-3">
        <TaxInvoiceReceipt
          storefrontUrl={storefrontUrl}
          outlet={outlet}
          order={order}
          invoice={invoice}
          showUrdu={showUrdu}
          widthMm={widthMm}
          operatorHeaderLines={headerLines}
          operatorFooterLines={footerLines}
          paymentDetails={paymentDetails}
          offline={offline}
        />
      </div>
    </Dialog>
  );
}
