import { CartSchema, toPaisaWire, toQtyWire, type Cart } from '@natech/contracts';

/**
 * `web_sessions.cart` round-trip — BUILD-PLAN.md §5.11, §2 R1;
 * docs/runfiles/M14-storefront.md.
 *
 * `Cart`'s money and quantity fields are branded `Paisa`/`Qty` bigints, and
 * `JSON.stringify` throws on a bigint — the same reason every contract that
 * crosses a boundary carries money as a decimal string (`money.ts`'s own doc
 * comment). `jsonb` is such a boundary: written as the wire shape
 * (`CartSchema`'s own `z.input`), read back through `CartSchema.parse`,
 * which is what turns the wire strings back into branded values.
 */
export function toStoredCart(cart: Cart): unknown {
  return {
    lines: cart.lines.map((line) => ({
      ...line,
      qty: toQtyWire(line.qty),
      unitPriceExTax: toPaisaWire(line.unitPriceExTax),
    })),
    tableToken: cart.tableToken,
    tableCode: cart.tableCode,
    note: cart.note,
  };
}

/** `null` for anything absent or malformed — a customer's first session legitimately has no cart yet. */
export function fromStoredCart(value: unknown): Cart | null {
  const parsed = CartSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
