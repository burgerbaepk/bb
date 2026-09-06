import 'server-only';
import { and, isNull, ne, notInArray, or, type SQL } from 'drizzle-orm';
import { orders } from '@natech/db';

/**
 * Which order rows a service surface may work on — BUILD-PLAN.md §11.3, §13.4.
 *
 * Two rules, in one place because four callers need both and one of them has
 * already been found missing one. `findOrderSummary` carries a comment saying
 * as much: "Same filter as `findOpenOrderForTable`, `listTrayOrders`, and
 * `activeOrderCount` just above — this was the one caller of `orders.id`
 * missing it." A predicate copied into four `where` clauses is a predicate
 * that will be copied into a fifth incorrectly.
 *
 * **Closed orders are not workable.** A `FINALIZED` or `VOIDED` order is
 * finished. Without this a stale `?orderId=` — a back button, an old tab, a
 * bookmark taken before a void — resurrects a dead order, and the cashier
 * types a round into a cart headed nowhere before `placeOrderAction` refuses
 * it.
 *
 * **A web order is not workable until a human has accepted it.** §13.4 is one
 * line long and unambiguous: *never auto-accept a web order*. A QR order is
 * written `channel = 'WEB', status = 'PLACED'` and waits in the inbox for the
 * accept-or-reject decision; accepting is what moves it to `SERVED`. Every
 * service surface previously asked only "is this order not finished?", so an
 * order nobody had accepted was already sitting in the active-orders tray,
 * already holding its table on the floor plan, already loadable and already
 * payable — indistinguishable from one staff had agreed to make. The rule
 * survived in the inbox's buttons and nowhere else, which is the same as not
 * having it: the kitchen starts on an order the floor never agreed it could
 * fulfil, and the customer watching `/order/[publicId]` is still told they are
 * waiting for staff.
 *
 * Deliberately **not** applied to `transferTableAction`'s bulk order move
 * (`lib/floor/actions.ts`). A party that changes table takes its pending QR
 * order with it; excluding it there would strand the order on the table the
 * party has left.
 */
const CLOSED_ORDER_STATUSES = ['FINALIZED', 'VOIDED'] as const;

export function workableOrder(): SQL | undefined {
  return and(
    isNull(orders.deletedAt),
    notInArray(orders.status, [...CLOSED_ORDER_STATUSES]),
    // De Morgan of "not (WEB and PLACED)". Both columns are `notNull`, so
    // there is no third truth value for a row to fall through on — an
    // `IS DISTINCT FROM` dance would only obscure that.
    or(ne(orders.channel, 'WEB'), ne(orders.status, 'PLACED')),
  );
}
