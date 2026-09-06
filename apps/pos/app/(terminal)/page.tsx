import type { Metadata } from 'next';
import { dbRead } from '@natech/db';
import { linesSubtotal, priceLines } from '@natech/domain';
import { can, type Menu } from '@natech/contracts';
import { OrderScreen } from '@/components/order/OrderScreen';
import { currentTillIdentity } from '@/lib/auth/session';
import { readInvoiceStorefrontUrl } from '@/lib/seo/queries';
import { readBrandConfig } from '@/lib/branding/queries';
import { listTables, listZones } from '@/lib/floor/queries';
import { listCategories, listMenuItems } from '@/lib/menu/queries';
import { findOpenOrderForTable } from '@/lib/orders/queries';
import { loadPriceableOrder } from '@/lib/orders/pricing';
import { readOutletConfig } from '@/lib/outlet/queries';
import { readActivePrintPath, readTaxPolicy, readTaxRules } from '@/lib/tax/queries';
import { resolveAssetUrl } from '@/lib/assets';

/**
 * The till — BUILD-PLAN.md §18 M04, §5.6, §10.6 (M09a), §9.3/§11.3 (M09b),
 * §6/§12 (M10).
 *
 * M09a replaced the menu and floor plan with the real reads M08 already
 * built (`lib/menu/queries.ts`, `lib/floor/queries.ts`) and `canDiscount`
 * with the real till identity (`requireTillStaff()` — §14.2's "who is at the
 * till", the identity `placeOrderAction` also checks, not
 * `requireOperator()`'s back-office one; `(terminal)/layout.tsx`
 * already gates this page on an identified till, so this call succeeds in
 * the normal path and only re-derives what the layout already established,
 * the same "no middleware, every surface asks again" discipline every other
 * protected page in this app follows).
 *
 * M09b adds `?tableId=`/`?orderId=` — the floor plan's `OPEN_ORDER`/
 * `LOAD_ORDER` and the tray's `LOAD ORDER` both land here, resolving to the
 * one open order already on that table or order id, if any
 * (docs/runfiles/M09b-floor-live.md §3 — shown read-only, a second round
 * appended on top rather than a reconstructed cart).
 *
 * M10 adds `?action=pay` — the floor plan's `TAKE_PAYMENT` and the tray's
 * equivalent land here the same way, and `serverOrder` gives `OrderScreen`
 * the real, DB-read order payment/finalize actually operates on (never the
 * client's own cart lines — see `OrderScreen`'s own doc comment). ADR 0019
 * removed `?action=check` along with the pre-payment check.
 *
 * Receipt identity is read from the singleton `outlet_config`; fiscal
 * documents must never fall back to mock business data. `orderNo` remains a
 * placeholder only for the live cart preview before the server allocates the
 * real number in `placeOrderAction`.
 */
export const metadata: Metadata = {
  title: 'Order',
  robots: { index: false, follow: false },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const identity = await currentTillIdentity();
  // Layouts and pages render concurrently. The layout owns the sign-in/lock
  // UI, so a page with no till identity must stay inert instead of throwing.
  if (identity === null) return null;
  const { viewer } = identity;
  const params = await searchParams;
  const orderId = typeof params['orderId'] === 'string' ? params['orderId'] : null;
  const tableId = typeof params['tableId'] === 'string' ? params['tableId'] : null;
  const actionParam = typeof params['action'] === 'string' ? params['action'] : null;
  const initialAction = actionParam === 'pay' ? actionParam : null;

  // Resolve and hydrate the requested order while the menu/config reads are
  // in flight. Previously the full order started only after every other page
  // query and after a separate summary query had completed.
  const requestedOrder = (async () => {
    if (orderId !== null) {
      const loaded = await loadPriceableOrder(dbRead(), orderId);
      if (
        loaded === null ||
        loaded.order.status === 'FINALIZED' ||
        loaded.order.status === 'VOIDED'
      ) {
        return { existingOrder: null, priceable: null };
      }
      return {
        existingOrder: {
          orderId: loaded.order.id,
          orderNo: loaded.order.orderNo,
          tableId: loaded.order.tableId,
          guestCount: loaded.order.guestCount,
          itemCount: loaded.order.lines.length,
          subtotalExTax: linesSubtotal(priceLines(loaded.domainLines)),
        },
        priceable: loaded,
      };
    }

    if (tableId !== null) {
      const existingOrder = await findOpenOrderForTable(tableId);
      const priceable =
        existingOrder === null ? null : await loadPriceableOrder(dbRead(), existingOrder.orderId);
      return { existingOrder, priceable };
    }

    return { existingOrder: null, priceable: null };
  })();

  const [
    categories,
    items,
    zones,
    tables,
    orderData,
    taxPolicy,
    taxRules,
    activePrintPath,
    branding,
    storefrontUrl,
    outlet,
  ] = await Promise.all([
    listCategories(),
    listMenuItems({ popularFirst: true }),
    listZones(),
    listTables(),
    requestedOrder,
    readTaxPolicy(),
    readTaxRules(),
    readActivePrintPath(),
    readBrandConfig(),
    readInvoiceStorefrontUrl(),
    readOutletConfig(),
  ]);

  if (outlet === null) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <h1 className="text-xl font-semibold">Outlet settings unavailable</h1>
        <p className="text-ink-muted mt-2">
          Configure the outlet identity in Settings before taking orders.
        </p>
      </main>
    );
  }

  const { existingOrder, priceable } = orderData;

  const menu: Menu = { categories, items };
  const menuImageUrls = Object.fromEntries(
    items.map((item) => [item.id, resolveAssetUrl(item.imageKey)]),
  );
  const initialTable =
    existingOrder?.tableId !== undefined && existingOrder?.tableId !== null
      ? (tables.find((table) => table.id === existingOrder.tableId) ?? null)
      : tableId !== null
        ? (tables.find((table) => table.id === tableId) ?? null)
        : null;

  return (
    <OrderScreen
      // `orderId`/`tableId`/`action` land here via `router.push` on this same
      // route — a searchParams-only navigation, which Next reuses the mounted
      // `OrderScreen` instance for rather than remounting it. Every field this
      // screen seeds with `useState(propValue)` (`placedOrder`, `realOrder`,
      // `lines`) would otherwise carry over stale from whichever order/action
      // this screen was last on — silently no-op-ing "Take payment" after the
      // first one, or worse, acting on the wrong order's id. Keying by the
      // navigation target forces a fresh mount per distinct destination.
      key={`${orderId ?? tableId ?? 'draft'}:${initialAction ?? ''}`}
      outlet={outlet}
      storefrontUrl={storefrontUrl}
      menu={menu}
      menuImageUrls={menuImageUrls}
      zones={zones}
      tables={tables}
      orderNo={1}
      canDiscount={can(viewer, 'discount.apply')}
      initialTable={initialTable}
      existingOrder={existingOrder}
      serverOrder={priceable?.order ?? null}
      initialAction={initialAction}
      taxPolicy={taxPolicy}
      taxRules={taxRules}
      activePrintPath={activePrintPath}
      showUrdu={branding.receipt.showUrdu}
      receiptWidthMm={branding.receipt.widthMm}
      receiptHeaderLines={branding.receipt.headerLines}
      receiptFooterLines={branding.receipt.footerLines}
      receiptPaymentDetails={branding.receipt.paymentDetails}
    />
  );
}
