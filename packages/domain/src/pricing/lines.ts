import { add, subtract, sum, ZERO, type Paisa } from '../money/paisa';
import { extend, type Qty } from '../money/quantity';
import type { TaxClassKey } from '../tax/policy';

/**
 * Line pricing — BUILD-PLAN.md §6.3, §5.3, §5.6.
 *
 * `menu_items.base_price` is tax-exclusive (§5.3), confirmed against the
 * reference receipt: the menu shows Rs. 530 and the invoice line reads
 * 4 × 530.00 = 2,120.00 against Total (Ex Tax) 12,220.00.
 *
 * The unit price handed in here already includes any variant delta, because
 * §5.6 snapshots `unit_price` onto the order line at add time. A later menu
 * edit must not alter an invoice that has been transmitted.
 */

export interface LineModifier {
  readonly name: string;
  /** §15.1 — bilingual line names on the check/tax invoice. */
  readonly nameUr?: string | null | undefined;
  readonly priceDelta: Paisa;
}

export interface OrderLine {
  readonly id: string;
  readonly name: string;
  /** §15.1 — bilingual line names on the check/tax invoice. */
  readonly nameUr?: string | null | undefined;
  readonly taxClass: TaxClassKey;
  /** Base price plus variant delta, snapshotted at add time. */
  readonly unitPrice: Paisa;
  readonly qty: Qty;
  readonly modifiers?: readonly LineModifier[] | undefined;
  readonly lineDiscount?: Paisa | undefined;
  /** A voided line contributes nothing but stays on the order for the audit trail. */
  readonly isVoid?: boolean | undefined;
}

export interface PricedLine {
  readonly line: OrderLine;
  /** qty × unit price. */
  readonly extended: Paisa;
  readonly modifierTotal: Paisa;
  /** extended + modifiers, before any discount. */
  readonly gross: Paisa;
  readonly lineDiscount: Paisa;
  /** gross − line discount. */
  readonly net: Paisa;
}

/**
 * §6.3 defines the line subtotal as `Σ(qty × unit_price) + modifier deltas`.
 *
 * Read literally, and implemented literally: the modifier delta is **not**
 * multiplied by the quantity. That is worth a second look before modifiers ship
 * in M08 — three burgers with extra cheese arguably means three portions of
 * cheese, and this charges for one. The reference invoice carries no modifiers,
 * so it cannot settle the question, and guessing against the written formula
 * would be a silent price change. Flagged in the M03 runfile.
 */
export function priceLine(line: OrderLine): PricedLine {
  if (line.isVoid === true) {
    return {
      line,
      extended: ZERO,
      modifierTotal: ZERO,
      gross: ZERO,
      lineDiscount: ZERO,
      net: ZERO,
    };
  }

  const extended = extend(line.unitPrice, line.qty);
  const modifierTotal = sum((line.modifiers ?? []).map((modifier) => modifier.priceDelta));
  const gross = add(extended, modifierTotal);
  const lineDiscount = line.lineDiscount ?? ZERO;

  return {
    line,
    extended,
    modifierTotal,
    gross,
    lineDiscount,
    net: subtract(gross, lineDiscount),
  };
}

export function priceLines(lines: readonly OrderLine[]): readonly PricedLine[] {
  return lines.map(priceLine);
}

/** Gross of all lines, before any discount. The `Subtotal (ex tax)` on a check. */
export function linesSubtotal(priced: readonly PricedLine[]): Paisa {
  return sum(priced.map((p) => p.gross));
}

export function linesDiscountTotal(priced: readonly PricedLine[]): Paisa {
  return sum(priced.map((p) => p.lineDiscount));
}
