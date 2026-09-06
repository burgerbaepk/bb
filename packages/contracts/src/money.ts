import { paisa, parseQty, qtyToString, type Paisa, type Qty } from '@natech/domain';
import { z } from 'zod';

/**
 * Money and quantity on the wire — BUILD-PLAN.md §2 R1, §5.6, §8.
 *
 * R1 holds money as `bigint` paisa everywhere in the product. JSON has no
 * bigint, and `JSON.stringify(1n)` throws rather than quietly losing precision,
 * so every contract that crosses a boundary carries money as a **decimal string
 * of paisa**: `"1380960"` is Rs. 13,809.60.
 *
 * A number would be the obvious alternative and is the one that fails. The
 * §8 offline path replays a queued order to the server, which recomputes the
 * invoice authoritatively; a total that changed by a paisa in transit is a
 * `TAX_DRIFT` report against a sale that has already completed on the terminal.
 *
 * Quantity travels the same way for the same reason, as the `numeric(10,3)`
 * string Drizzle round-trips.
 */

const PAISA_WIRE = /^-?\d+$/;

/** The wire form: a decimal string of paisa. */
export const PaisaWireSchema = z
  .string()
  .regex(PAISA_WIRE, 'money is a decimal string of paisa, e.g. "1380960" for Rs. 13,809.60');

/** Wire form in, branded `Paisa` out. */
export const PaisaSchema = PaisaWireSchema.transform((text) => paisa(BigInt(text)));

export function toPaisaWire(value: Paisa): string {
  return value.toString();
}

/** `numeric(10,3)` as a string: `"4.000"`, `"0.500"`. */
export const QtyWireSchema = z.string().regex(/^-?\d+(\.\d{1,3})?$/, 'quantity has three decimals');

export const QtySchema = QtyWireSchema.transform((text) => parseQty(text));

export function toQtyWire(value: Qty): string {
  return qtyToString(value);
}

/** Basis points. Never a float percentage (§5.10). */
export const RateBpsSchema = z.int().min(0).max(10_000);

/** A timestamp on the wire is ISO-8601 UTC (§7.3). */
export const InstantSchema = z.iso.datetime({ offset: true }).or(z.iso.datetime());

/** `business_date` is a calendar date, set explicitly at finalize (§5.8, C6). */
export const BusinessDateSchema = z.iso.date();
