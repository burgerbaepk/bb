import { paisa, whole, type OrderLine as DomainLine, type Paisa } from '@natech/domain';
import type { ItemVariant, MenuItem, Modifier, OrderLine } from '@natech/contracts';

/**
 * The cart, as the order screen holds it — BUILD-PLAN.md §5.3, §5.6, §6.9.
 *
 * A cart line carries the item it came from **and** the price it was added at,
 * because §5.6 snapshots `unit_price` onto the order line. The unit price is the
 * base price plus the variant delta, resolved once, here. A menu edit later in
 * the evening must not move a figure a customer has already been shown.
 *
 * There is no tax anywhere in this model (R9, §6.9). The cart shows
 * `Subtotal (ex tax)` and a prompt to print the check for the full total; the
 * rate is not knowable until the customer chooses how to pay. The system this
 * replaces labels the cart `Tax (16%)` regardless of method (defect C5), and the
 * defence against repeating that is having nowhere to put the number.
 */
export interface CartLine {
  readonly key: string;
  readonly item: MenuItem;
  readonly variant: ItemVariant | null;
  readonly qty: number;
  readonly modifiers: readonly Modifier[];
  readonly note: string | null;
  readonly seatNo: number | null;
  /**
   * Client-local only, never a DB column. Null until `placeOrderAction`
   * succeeds for this line; set to the moment it did. What distinguishes a
   * second round's "add mains again" from "add dessert this round" is
   * exactly this field, via `addToCart`'s merge rule below.
   */
  readonly sentAt: Date | null;
  /**
   * The real `order_lines.id` this line already exists as on the server, or
   * null for a line only ever local. Set exactly when `sentAt` is (a loaded
   * booked order's lines carry both from the moment they hydrate — see
   * `lineFromOrderLine`), and is what "Save Order" diffs the cart against to
   * find what changed: a line missing from `lines` entirely, or present at a
   * lower `qty`, needs `voidOrderLinesAction` before anything new is sent.
   */
  readonly sentLineId: string | null;
}

/**
 * Reconstruct a cart line from a server order line — how a loaded booked
 * order's already-sent items get back into the editable cart ("Load order"
 * in the Booked Orders flow, 2026-08-27).
 *
 * Built from the line's own snapshot (`nameSnapshot`, `unitPrice`), never a
 * live menu lookup — the same "a menu edit later must not move a figure
 * already shown" reasoning `unitPriceOf` exists for, above. The stub
 * `MenuItem` carries that snapshot through the same rendering/pricing path
 * every other cart line already uses; `variants`/`modifierGroups` are empty
 * because nothing re-opens `ItemOptionsSheet` against a loaded line —
 * increasing its quantity or decreasing it both go through the caller
 * diffing this line against a fresh one priced off the real, current menu,
 * never an edit of this object in place.
 */
export function lineFromOrderLine(orderLine: OrderLine): CartLine {
  const item: MenuItem = {
    id: orderLine.menuItemId ?? orderLine.id,
    categoryId: '',
    sku: null,
    name: orderLine.nameSnapshot,
    nameUr: orderLine.nameUrSnapshot,
    slug: '',
    description: null,
    descriptionUr: null,
    imageKey: null,
    basePrice: orderLine.unitPrice,
    taxClass: orderLine.taxClass,
    variants: [],
    modifierGroups: [],
    sortOrder: 0,
    isActive: true,
  };
  const variant: ItemVariant | null =
    orderLine.variantId === null
      ? null
      : {
          id: orderLine.variantId,
          name: orderLine.variantLabel ?? '',
          nameUr: null,
          priceDelta: paisa(0n),
          isDefault: false,
        };

  return {
    key: orderLine.id,
    item,
    variant,
    qty: Number(orderLine.qty) / 1000,
    modifiers: orderLine.modifiers.map((modifier) => ({
      id: modifier.modifierId ?? modifier.id,
      name: modifier.nameSnapshot,
      nameUr: modifier.nameUrSnapshot,
      priceDelta: modifier.priceDelta,
    })),
    note: orderLine.note,
    seatNo: orderLine.seatNo,
    // Any non-null value marks the line as already sent — `unsentLines`
    // and `addToCart`'s merge rule only ever check this for null, never
    // read the instant itself (the server no longer records one per line).
    sentAt: new Date(),
    sentLineId: orderLine.id,
  };
}

/** Base price plus the variant delta, snapshotted at add time (§5.6). */
export function unitPriceOf(item: MenuItem, variant: ItemVariant | null): Paisa {
  return paisa(item.basePrice + (variant?.priceDelta ?? 0n));
}

export function lineLabel(line: CartLine): string {
  return line.variant === null ? line.item.name : `${line.item.name} ${line.variant.name}`;
}

/** Map the cart onto the engine's line shape so pricing runs through domain. */
export function toDomainCartLines(lines: readonly CartLine[]): DomainLine[] {
  return lines.map((line) => ({
    id: line.key,
    name: lineLabel(line),
    taxClass: line.item.taxClass,
    unitPrice: unitPriceOf(line.item, line.variant),
    qty: whole(line.qty),
    modifiers: line.modifiers.map((modifier) => ({
      name: modifier.name,
      priceDelta: modifier.priceDelta,
    })),
  }));
}

/**
 * A stable key for a cart line.
 *
 * Two lines of the same item with the same variant, modifiers, seat, and note
 * are the same line and stack. Two with a different note do not — "no onion"
 * on one of three plates is a different instruction, and merging them would
 * lose it.
 */
export function cartLineKey(
  item: MenuItem,
  variant: ItemVariant | null,
  modifiers: readonly Modifier[],
  seatNo: number | null,
  note: string | null,
): string {
  const modifierPart = [...modifiers.map((modifier) => modifier.id)].sort().join('+');
  return [item.id, variant?.id ?? '', modifierPart, seatNo ?? '', note ?? ''].join('|');
}

/**
 * Merge a candidate into the cart, or append it as a new line.
 *
 * Only merges with a line that has not yet been sent (`sentAt === null`) —
 * once a line has been sent, "one more of the same thing" is a new round,
 * not more of an already-placed line, and inflating that line's `qty` would
 * silently double what was already committed to the order. When every
 * matching line has already been sent, the candidate becomes a new line with
 * a disambiguated key (so React's list key and `changeQty`/`removeLine`'s
 * lookups both stay unique) — `cartLineKey` alone is unchanged and untouched
 * for the common case where nothing has been sent yet, so a single-round
 * order behaves exactly as before.
 */
export function addToCart(lines: readonly CartLine[], candidate: CartLine): CartLine[] {
  const existingIndex = lines.findIndex(
    (line) => line.key === candidate.key && line.sentAt === null,
  );
  if (existingIndex !== -1) {
    return lines.map((line, index) =>
      index === existingIndex ? { ...line, qty: line.qty + candidate.qty } : line,
    );
  }

  const alreadySent = lines.some((line) => line.key === candidate.key);
  if (!alreadySent) return [...lines, candidate];
  return [...lines, { ...candidate, key: `${candidate.key}::${crypto.randomUUID()}` }];
}

/** Cart lines not yet placed on the order — what the automatic pre-print/finalize placement sends. */
export function unsentLines(lines: readonly CartLine[]): CartLine[] {
  return lines.filter((line) => line.sentAt === null);
}

/** Stamp `sentAt` on exactly the lines a successful `placeOrderAction` call reports back. */
export function markSent(
  lines: readonly CartLine[],
  keys: readonly string[],
  sentAt: Date,
): CartLine[] {
  const sentKeys = new Set(keys);
  return lines.map((line) => (sentKeys.has(line.key) ? { ...line, sentAt } : line));
}

export function changeQty(lines: readonly CartLine[], key: string, delta: number): CartLine[] {
  return lines
    .map((line) => (line.key === key ? { ...line, qty: line.qty + delta } : line))
    .filter((line) => line.qty > 0);
}

/** Set a line's quantity outright — the fast-billing Qty field commits an absolute value, not a step. */
export function setQty(lines: readonly CartLine[], key: string, qty: number): CartLine[] {
  return lines
    .map((line) => (line.key === key ? { ...line, qty } : line))
    .filter((line) => line.qty > 0);
}

export function removeLine(lines: readonly CartLine[], key: string): CartLine[] {
  return lines.filter((line) => line.key !== key);
}

export function cartItemCount(lines: readonly CartLine[]): number {
  return lines.reduce((count, line) => count + line.qty, 0);
}
