'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { paisa, whole, type Paisa } from '@natech/domain';
import type { Cart, CartLine, PublicMenuItem } from '@natech/contracts';
import { saveCartAction } from '@/lib/cart/actions';

/**
 * The storefront cart — BUILD-PLAN.md §5.11, §13.2, §13.4;
 * docs/runfiles/M14-storefront.md.
 *
 * §13.2 is what shapes this: **ex-tax prices only**, and no total. The payment
 * method is unknown until the counter, and tax is 16% on cash against 8% on card
 * — on a Rs. 12,220 order that is a Rs. 977.60 spread. Showing a customer a
 * single inclusive figure here would be a guess presented as a price, and they
 * would rightly treat the difference at the counter as a mistake.
 *
 * So the cart states a subtotal and says what happens next. The tax invoice
 * they are handed when they pay at the counter is the first and only document
 * with a total on it (ADR 0019 removed the pre-payment check outright).
 *
 * §5.11 persists this in `web_sessions.cart`: `initialCart` seeds state from
 * whatever the root layout found for an already-signed-in customer, and
 * every mutation fires `saveCartAction` — a no-op before a session exists
 * (anonymous browsing stays exactly what M06 built, in-memory only), so
 * this component never has to track for itself whether one does.
 */
interface CartContextValue {
  readonly lines: readonly CartLine[];
  readonly tableCode: string | null;
  readonly tableToken: string | null;
  readonly subtotalExTax: Paisa;
  readonly itemCount: number;
  readonly add: (item: PublicMenuItem, variantId: string | null) => void;
  /**
   * One more of a line already in the cart. Distinct from `add` because the
   * cart screen holds `CartLine`s, not the `PublicMenuItem` `add` needs — and
   * without it the only quantity control there could be is a decrement, which
   * is what the cart shipped with: a customer who wanted a third naan had to
   * navigate back to the menu to get one.
   */
  readonly increment: (lineId: string) => void;
  /** One fewer. The line disappears at zero. */
  readonly remove: (lineId: string) => void;
  /**
   * The whole line, gone. Decrementing five of something five times is not a
   * way to change your mind about it, and it was the only way the cart offered.
   */
  readonly removeLine: (lineId: string) => void;
  readonly setTable: (token: string, code: string) => void;
  readonly clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (value === null) throw new Error('useCart must be used inside CartProvider');
  return value;
}

export interface CartProviderProps {
  readonly children: ReactNode;
  readonly initialCart?: Cart | null;
}

export function CartProvider({ children, initialCart = null }: CartProviderProps) {
  const [lines, setLines] = useState<readonly CartLine[]>(initialCart?.lines ?? []);
  const [table, setTableState] = useState<{ token: string; code: string } | null>(
    initialCart?.tableToken !== null && initialCart?.tableToken !== undefined
      ? { token: initialCart.tableToken, code: initialCart.tableCode ?? '' }
      : null,
  );

  const add = useCallback((item: PublicMenuItem, variantId: string | null) => {
    const variant = item.variants.find((candidate) => candidate.id === variantId) ?? null;
    const lineId = `${item.id}:${variant?.id ?? 'base'}`;

    setLines((current) => {
      const existing = current.findIndex((line) => line.lineId === lineId);
      if (existing !== -1) {
        return current.map((line, index) =>
          index === existing ? { ...line, qty: (line.qty + 1000n) as typeof line.qty } : line,
        );
      }
      return [
        ...current,
        {
          lineId,
          itemId: item.id,
          variantId: variant?.id ?? null,
          name: item.name,
          nameUr: item.nameUr,
          variantLabel: variant?.name ?? null,
          qty: whole(1),
          unitPriceExTax: variant?.priceExTax ?? item.priceExTax,
          note: null,
        },
      ];
    });
  }, []);

  const increment = useCallback((lineId: string) => {
    setLines((current) =>
      current.map((line) =>
        line.lineId === lineId ? { ...line, qty: (line.qty + 1000n) as typeof line.qty } : line,
      ),
    );
  }, []);

  const remove = useCallback((lineId: string) => {
    setLines((current) =>
      current
        .map((line) =>
          line.lineId === lineId ? { ...line, qty: (line.qty - 1000n) as typeof line.qty } : line,
        )
        .filter((line) => line.qty > 0n),
    );
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setLines((current) => current.filter((line) => line.lineId !== lineId));
  }, []);

  // Fire-and-forget: `saveCartAction` itself decides whether there is a
  // session to persist against. The ref skips the very first render so a
  // freshly hydrated `initialCart` never re-saves itself unchanged.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const cart: Cart = {
      lines: [...lines],
      tableToken: table?.token ?? null,
      tableCode: table?.code ?? null,
      note: null,
    };
    void saveCartAction(cart);
  }, [lines, table]);

  const value = useMemo<CartContextValue>(() => {
    const subtotal = paisa(
      lines.reduce((total, line) => total + (line.unitPriceExTax * line.qty) / 1000n, 0n),
    );

    return {
      lines,
      tableCode: table?.code ?? null,
      tableToken: table?.token ?? null,
      subtotalExTax: subtotal,
      itemCount: lines.reduce((count, line) => count + Number(line.qty / 1000n), 0),
      add,
      increment,
      remove,
      removeLine,
      setTable: (token, code) => setTableState({ token, code }),
      clear: () => setLines([]),
    };
  }, [lines, table, add, increment, remove, removeLine]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
