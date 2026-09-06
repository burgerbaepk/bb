import { extend, paisa, whole } from '@natech/domain';
import type { PublicMenu, PublicOrderStatus, QrResolution } from '../src/storefront';
import { MOCK_CATEGORIES, MOCK_MENU_ITEMS } from './menu';
import { orderBySlug } from './orders';
import { ago, uuidFrom } from './ids';

/**
 * The storefront dataset — BUILD-PLAN.md §13.
 *
 * §13.2 governs every price here: **ex tax only**, with the notice explaining
 * that tax is added at payment, 16% on cash and 8% on card and digital. There
 * is no inclusive figure to build, because the payment method is unknown until
 * the counter and any inclusive price shown here would be a guess presented as
 * a price.
 */

export const MOCK_PUBLIC_MENU: PublicMenu = {
  categories: MOCK_CATEGORIES.map((category) => ({
    id: category.id,
    slug: category.slug,
    name: category.name,
    nameUr: category.nameUr,
    sortOrder: category.sortOrder,
  })),
  items: MOCK_MENU_ITEMS.filter((item) => item.isActive).map((item) => {
    const category = MOCK_CATEGORIES.find((candidate) => candidate.id === item.categoryId);
    return {
      id: item.id,
      slug: item.slug,
      categorySlug: category?.slug ?? '',
      name: item.name,
      nameUr: item.nameUr,
      description: item.description,
      descriptionUr: item.descriptionUr,
      imageUrl: null,
      priceExTax: item.basePrice,
      variants: item.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        nameUr: variant.nameUr,
        priceExTax: paisa(item.basePrice + variant.priceDelta),
        isDefault: variant.isDefault,
      })),
      isAvailable: true,
    };
  }),
};

/** §5.11, §13.1 — `/t/[token]` resolves the table and opens the ordering sheet. */
export const MOCK_QR_TOKENS: readonly QrResolution[] = [
  {
    token: 'qr-table-12',
    tableId: uuidFrom('table:12'),
    tableCode: '12',
    zoneName: 'Bala Upstairs',
    isActive: true,
  },
  {
    token: 'qr-table-4',
    tableId: uuidFrom('table:4'),
    tableCode: '4',
    zoneName: 'Front',
    isActive: true,
  },
  {
    token: 'qr-retired',
    tableId: uuidFrom('table:2'),
    tableCode: '2',
    zoneName: 'Front',
    isActive: false,
  },
];

export function resolveQrToken(token: string): QrResolution | null {
  return MOCK_QR_TOKENS.find((entry) => entry.token === token) ?? null;
}

/** §13.4 — what `/order/[publicId]` shows the customer. */
export const MOCK_PUBLIC_ORDERS: readonly PublicOrderStatus[] = [
  {
    publicId: 'WEB-20394',
    orderNo: 20394,
    status: 'PLACED',
    decision: 'PENDING',
    rejectReason: null,
    tableCode: '12',
    placedAt: orderBySlug('web-22').openedAt,
    acceptedAt: null,
    lines: orderBySlug('web-22').lines.map((line) => ({
      name: line.nameSnapshot,
      nameUr: line.nameUrSnapshot,
      qtyLabel: `${line.qty / 1000n}×`,
      lineTotalExTax: extend(line.unitPrice, line.qty),
    })),
    subtotalExTax: paisa(
      orderBySlug('web-22').lines.reduce(
        (total, line) => total + extend(line.unitPrice, line.qty),
        0n,
      ),
    ),
  },
  {
    publicId: 'WEB-20388',
    orderNo: 20388,
    status: 'SERVED',
    decision: 'ACCEPTED',
    rejectReason: null,
    tableCode: '3',
    placedAt: ago(2400),
    acceptedAt: ago(2280),
    lines: [
      {
        name: 'Chicken Handi',
        nameUr: 'چکن ہانڈی',
        qtyLabel: '1×',
        lineTotalExTax: extend(paisa(124000n), whole(1)),
      },
      {
        name: 'Roghni Nan',
        nameUr: 'روغنی نان',
        qtyLabel: '4×',
        lineTotalExTax: extend(paisa(12000n), whole(4)),
      },
    ],
    subtotalExTax: paisa(172000n),
  },
  {
    publicId: 'WEB-20386',
    orderNo: 20386,
    status: 'VOIDED',
    decision: 'REJECTED',
    rejectReason: 'Closing soon',
    tableCode: null,
    placedAt: ago(5200),
    acceptedAt: null,
    lines: [],
    subtotalExTax: paisa(0n),
  },
];

export function publicOrderById(publicId: string): PublicOrderStatus | null {
  return MOCK_PUBLIC_ORDERS.find((order) => order.publicId === publicId) ?? null;
}
