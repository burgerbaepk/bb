/**
 * The Phase 1 dataset — BUILD-PLAN.md §18 M04–M06, §19.
 *
 * Every screen in M04, M05, and M06 renders from here. Three things make that
 * worth doing rather than scattering fixtures through the apps.
 *
 * **One dataset proves the contracts.** The POS, the admin back office, and the
 * storefront read the same orders. A field that one surface needs and
 * the contract lacks is a compile error, which is the point of freezing the
 * shapes at the end of M06 (§0 rule 7).
 *
 * **Every money figure is computed, not typed.** Totals come from
 * `@natech/domain`'s `computeTotals`. A hand-written 13,809.60 would agree
 * with the plan and disagree with the engine, which is the one defect a
 * static-UI milestone could plausibly ship.
 *
 * **It is deletable in one move.** The `mock-data-grep` gate permits mock data
 * only under a `mocks/` directory (defect C4), so Phase 2 wiring deletes this
 * folder rather than hunting for stragglers.
 */

export { MOCK_NOW, MOCK_BUSINESS_DATE, ago, elapsed, uuidFrom } from './ids';

export {
  MOCK_OUTLET,
  MOCK_TERMINALS,
  MOCK_ROLES,
  MOCK_STAFF,
  MOCK_VIEWER_CASHIER,
  MOCK_VIEWER_WAITER,
  MOCK_VIEWER_OWNER,
} from './outlet';

export {
  MOCK_CATEGORIES,
  MOCK_MODIFIER_GROUPS,
  MOCK_MENU_ITEMS,
  MOCK_MENU,
  categoryBySlug,
  itemBySlug,
} from './menu';

export {
  MOCK_TAX_RULES,
  MOCK_TAX_POLICY,
  MOCK_TAX_RULE_ROWS,
  MOCK_TAX_POLICY_SETTING,
} from './tax';

export {
  MOCK_ORDERS,
  MOCK_REFERENCE_ORDER,
  MOCK_DRAFT_ORDER,
  MOCK_WEB_ORDERS,
  orderBySlug,
  orderElapsedSeconds,
  orderSubtotal,
  trayLineSummary,
} from './orders';

export {
  MOCK_CREDIT_NOTES,
  MOCK_DECLINED_THEN_CASH_INVOICE,
  MOCK_DECLINED_THEN_CASH_TOTALS,
  MOCK_INVOICES,
  MOCK_REFERENCE_INVOICE,
  MOCK_REFERENCE_TOTALS,
  MOCK_SPLIT_SLICES,
  totalsFor,
} from './invoices';

export { MOCK_TABLES, MOCK_TABLE_SESSIONS, MOCK_ZONES, floorSummary, tableChips } from './floor';

export {
  MOCK_PUBLIC_MENU,
  MOCK_PUBLIC_ORDERS,
  MOCK_QR_TOKENS,
  publicOrderById,
  resolveQrToken,
} from './storefront';

export {
  MOCK_ALL_SETTING_DEFINITIONS,
  MOCK_OPERATIONAL_SETTINGS,
  MOCK_SETTING_DEFINITIONS,
  MOCK_SETTING_HISTORY,
  MOCK_SETTING_VALUES,
} from './settings';

export { MOCK_TRAY_ORDERS, trayOrders } from './tray';

export { MOCK_BRAND } from './branding';

export {
  MOCK_AUDITOR_PACK,
  MOCK_CATEGORY_MIX,
  MOCK_CHANNEL_MIX,
  MOCK_COVERS_PER_WAITER,
  MOCK_EXCEPTIONS,
  MOCK_FLOOR_PERFORMANCE,
  MOCK_ITEM_SALES,
  MOCK_PAYMENT_MIX,
  MOCK_SALES_BY_DATE,
  MOCK_SHIFT_REPORT,
  MOCK_TAX_LIABILITY,
} from './reports';
