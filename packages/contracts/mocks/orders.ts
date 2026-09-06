import { linesSubtotal, paisa, priceLines, whole, type Paisa, type Qty } from '@natech/domain';
import { toDomainLines, type Order, type OrderLine, type WebOrder } from '../src/orders';
import type { OrderChannel, OrderStatus, OrderType } from '../src/enums';
import { MOCK_BUSINESS_DATE, ago, elapsed, uuidFrom } from './ids';
import { itemBySlug } from './menu';

/**
 * Orders — BUILD-PLAN.md §5.6, §11, Appendix A.1.
 *
 * The first order is the Appendix A.1 reference invoice, line for line, so that
 * every screen that prices it can be checked against a document that already
 * exists: Rs. 12,220.00 ex tax, Rs. 13,809.60 on card, Rs. 14,787.20 on cash.
 *
 * **No order here carries a tax figure** (R9). The subtotal a tray card or a
 * table chip shows is computed from the lines by `@natech/domain`; the tax
 * only appears once an invoice is finalized.
 */

interface LineSpec {
  readonly itemSlug: string;
  readonly qty: number;
  readonly unitPrice: bigint;
  readonly variantLabel?: string;
  readonly note?: string;
  readonly modifiers?: readonly (readonly [string, string, bigint])[];
  readonly seatNo?: number;
}

function line(orderSlug: string, spec: LineSpec, index: number): OrderLine {
  const item = itemBySlug(spec.itemSlug);

  return {
    id: uuidFrom(`line:${orderSlug}:${index}`),
    menuItemId: item.id,
    variantId:
      spec.variantLabel === undefined
        ? null
        : uuidFrom(`variant:${spec.itemSlug}:${spec.variantLabel}`),
    nameSnapshot: item.name,
    nameUrSnapshot: item.nameUr,
    variantLabel: spec.variantLabel ?? null,
    qty: whole(spec.qty) as Qty,
    unitPrice: paisa(spec.unitPrice),
    lineDiscount: paisa(0n),
    taxClass: 'STANDARD_FOOD',
    seatNo: spec.seatNo ?? null,
    note: spec.note ?? null,
    voidReason: null,
    modifiers: (spec.modifiers ?? []).map(([name, nameUr, delta], modifierIndex) => ({
      id: uuidFrom(`linemod:${orderSlug}:${index}:${modifierIndex}`),
      modifierId: null,
      nameSnapshot: name,
      nameUrSnapshot: nameUr,
      priceDelta: paisa(delta),
    })),
  };
}

interface OrderSpec {
  readonly slug: string;
  readonly orderNo: number;
  readonly channel: OrderChannel;
  readonly type: OrderType;
  readonly status: OrderStatus;
  readonly tableCode: string | null;
  readonly zoneName: string | null;
  readonly waiterInitials: string | null;
  readonly guestCount: number | null;
  readonly openedSecondsAgo: number;
  readonly customerName?: string;
  readonly customerPhone?: string;
  readonly orderDiscount?: bigint;
  readonly discountReason?: string;
  readonly note?: string;
  readonly lines: readonly LineSpec[];
}

const ORDER_SPECS: readonly OrderSpec[] = [
  {
    /** Appendix A.1, reproduced line for line. */
    slug: 'table-17',
    orderNo: 20390,
    channel: 'POS',
    type: 'DINE_IN',
    status: 'SERVED',
    tableCode: '17',
    zoneName: 'Upstairs',
    waiterInitials: 'AK',
    guestCount: 4,
    openedSecondsAgo: 1450,
    lines: [
      {
        itemSlug: 'mutton-tikka-4-pcs',
        qty: 4,
        unitPrice: 53000n,
        modifiers: [['Medium', 'درمیانی', 0n]],
      },
      {
        itemSlug: 'mutton-gola-kabab-5-pcs',
        qty: 3,
        unitPrice: 66000n,
      },
      {
        itemSlug: 'special-mutton-champ',
        qty: 3,
        unitPrice: 139000n,
      },
      {
        itemSlug: 'special-mutton-mix-olive',
        qty: 1,
        unitPrice: 302000n,
        variantLabel: 'Half',
      },
      {
        itemSlug: 'roti-per-head',
        qty: 3,
        unitPrice: 8000n,
      },
      {
        itemSlug: 'raita-half-bowl',
        qty: 1,
        unitPrice: 26000n,
      },
      {
        itemSlug: 'fresh-salad',
        qty: 1,
        unitPrice: 27000n,
      },
      {
        itemSlug: 'mineral-water-1-5-litre',
        qty: 1,
        unitPrice: 16000n,
      },
    ],
  },
  {
    slug: 'table-4',
    orderNo: 20391,
    channel: 'POS',
    type: 'DINE_IN',
    status: 'PLACED',
    tableCode: '4',
    zoneName: 'Front',
    waiterInitials: 'BA',
    guestCount: 6,
    openedSecondsAgo: 760,
    lines: [
      {
        itemSlug: 'mutton-karahi',
        qty: 1,
        unitPrice: 168000n,
        variantLabel: 'Full',
        modifiers: [['Extra hot', 'تیز', 0n]],
        note: 'Guest is allergic to nuts',
      },
      {
        itemSlug: 'roti-per-head',
        qty: 6,
        unitPrice: 8000n,
        modifiers: [['Buttered', 'مکھن لگا', 3000n]],
      },
      {
        itemSlug: 'fresh-salad',
        qty: 2,
        unitPrice: 27000n,
      },
      {
        itemSlug: 'sweet-lassi',
        qty: 3,
        unitPrice: 22000n,
      },
      {
        itemSlug: 'kheer',
        qty: 2,
        unitPrice: 32000n,
      },
    ],
  },
  {
    slug: 'table-9',
    orderNo: 20392,
    channel: 'POS',
    type: 'DINE_IN',
    status: 'SERVED',
    tableCode: '9',
    zoneName: 'Bala',
    waiterInitials: 'SI',
    guestCount: 2,
    openedSecondsAgo: 3900,
    lines: [
      {
        itemSlug: 'chicken-handi',
        qty: 1,
        unitPrice: 124000n,
      },
      {
        itemSlug: 'roghni-nan',
        qty: 4,
        unitPrice: 12000n,
      },
      {
        itemSlug: 'soft-drink-regular',
        qty: 2,
        unitPrice: 12000n,
      },
    ],
  },
  {
    slug: 'takeaway-71',
    orderNo: 20393,
    channel: 'POS',
    type: 'TAKE_AWAY',
    status: 'PLACED',
    tableCode: null,
    zoneName: null,
    waiterInitials: 'SI',
    guestCount: null,
    customerName: 'Counter pickup',
    openedSecondsAgo: 1900,
    lines: [
      {
        itemSlug: 'mutton-tikka-4-pcs',
        qty: 2,
        unitPrice: 53000n,
      },
      {
        itemSlug: 'chutney',
        qty: 2,
        unitPrice: 6000n,
      },
    ],
  },
  {
    slug: 'web-22',
    orderNo: 20394,
    channel: 'WEB',
    type: 'DINE_IN',
    status: 'PLACED',
    tableCode: '12',
    zoneName: 'Bala Upstairs',
    waiterInitials: null,
    guestCount: 3,
    customerName: 'Hira Yousaf',
    openedSecondsAgo: 210,
    note: 'Scanned the QR at the table',
    lines: [
      { itemSlug: 'chicken-tikka-2-pcs', qty: 3, unitPrice: 38000n },
      { itemSlug: 'roti-per-head', qty: 3, unitPrice: 8000n },
      { itemSlug: 'full-bowl-raita', qty: 1, unitPrice: 44000n },
    ],
  },
];

function toOrder(spec: OrderSpec): Order {
  const openedAt = ago(spec.openedSecondsAgo);
  const lines = spec.lines.map((lineSpec, index) => line(spec.slug, lineSpec, index));

  return {
    id: uuidFrom(`order:${spec.slug}`),
    orderNo: spec.orderNo,
    channel: spec.channel,
    type: spec.type,
    status: spec.status,
    tableId: spec.tableCode === null ? null : uuidFrom(`table:${spec.tableCode}`),
    tableCode: spec.tableCode,
    zoneName: spec.zoneName,
    tableSessionId: spec.tableCode === null ? null : uuidFrom(`session:${spec.slug}`),
    customerName: spec.customerName ?? null,
    customerPhone: spec.customerPhone ?? null,
    waiterInitials: spec.waiterInitials,
    guestCount: spec.guestCount,
    note: spec.note ?? null,
    clientOrderUuid: uuidFrom(`client-order:${spec.slug}`),
    businessDate: MOCK_BUSINESS_DATE,
    /** §6.7 — the rate resolves against this, never against finalize time. */
    serviceStartedAt: openedAt,
    openedAt,
    lines,
    orderDiscount: paisa(spec.orderDiscount ?? 0n),
    discountReason: spec.discountReason ?? null,
    serviceChargeBpsOverride: null,
  };
}

export const MOCK_ORDERS: readonly Order[] = ORDER_SPECS.map(toOrder);

export function orderBySlug(slug: string): Order {
  const found = MOCK_ORDERS.find((order) => order.id === uuidFrom(`order:${slug}`));
  if (found === undefined) throw new Error(`no order ${slug}`);
  return found;
}

/** The Appendix A.1 order. Every arithmetic review starts here. */
export const MOCK_REFERENCE_ORDER: Order = orderBySlug('table-17');

/** An order still being built at the till, which the order screen opens on. */
export const MOCK_DRAFT_ORDER: Order = {
  ...orderBySlug('table-4'),
  id: uuidFrom('order:draft'),
  orderNo: 20395,
  status: 'DRAFT',
  tableCode: '6',
  zoneName: 'Front',
  lines: orderBySlug('table-4').lines.slice(0, 3),
};

/**
 * §11.2 R16 — the tray derives its header count and sum from these rows, so a
 * header cannot disagree with the cards beneath it (defects C3, V1).
 */
export function trayLineSummary(order: Order): string[] {
  return order.lines
    .filter((orderLine) => orderLine.voidReason === null)
    .map((orderLine) => {
      const variant = orderLine.variantLabel === null ? '' : ` ${orderLine.variantLabel}`;
      return `${orderLine.qty / 1000n}× ${orderLine.nameSnapshot}${variant}`;
    });
}

export function orderElapsedSeconds(order: Order): number {
  return elapsed(order.openedAt);
}

/**
 * The subtotal a tray card, a table chip, and the cart all show (§6.9).
 *
 * Computed through `@natech/domain`, not typed into the mock. The point of
 * Phase 1 pricing every surface through the engine is that a screen and an
 * invoice cannot disagree about the same order.
 */
export function orderSubtotal(order: Order): Paisa {
  return linesSubtotal(priceLines(toDomainLines(order)));
}

/** §13.4 — a web order waits for a human. It is never auto-accepted. */
export const MOCK_WEB_ORDERS: readonly WebOrder[] = [
  {
    orderId: orderBySlug('web-22').id,
    publicId: 'WEB-20394',
    orderNo: 20394,
    placedAt: orderBySlug('web-22').openedAt,
    customerName: 'Hira Yousaf',
    customerEmail: 'hira@example.org',
    // Dine-in, and placed before sign-up collected either. This is the state
    // the inbox has to keep rendering (ADR 0022).
    customerPhone: null,
    customerAddress: null,
    tableCode: '12',
    itemCount: orderBySlug('web-22').lines.length,
    subtotalExTax: orderSubtotal(orderBySlug('web-22')),
    lines: orderBySlug('web-22').lines,
    note: 'Scanned the QR at the table',
    decision: 'PENDING',
    rejectReason: null,
  },
  {
    orderId: uuidFrom('order:web-21'),
    publicId: 'WEB-20388',
    orderNo: 20388,
    placedAt: ago(2400),
    customerName: 'Usman Tariq',
    customerEmail: 'usman@example.org',
    customerPhone: null,
    customerAddress: null,
    tableCode: '3',
    itemCount: 2,
    subtotalExTax: paisa(96000n),
    lines: [],
    note: null,
    decision: 'ACCEPTED',
    rejectReason: null,
  },
  {
    orderId: uuidFrom('order:web-20'),
    publicId: 'WEB-20386',
    orderNo: 20386,
    placedAt: ago(5200),
    customerName: 'Areeba Noor',
    customerEmail: 'areeba@example.org',
    // Take-away: no table, so the phone and the address are the only way staff
    // have of reaching this order's customer at all — which is why ADR 0022
    // put them on the contract.
    customerPhone: '0300 000 0000',
    customerAddress: 'Flat 4, Street 7, Model Town',
    tableCode: null,
    itemCount: 4,
    subtotalExTax: paisa(214000n),
    lines: [],
    note: null,
    decision: 'REJECTED',
    rejectReason: 'Closing soon',
  },
];
