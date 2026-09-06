'use client';

import { Layers } from 'lucide-react';
import { EmptyState, Money, cn } from '@natech/ui';
import type { MenuItem } from '@natech/contracts';

/**
 * The order grid — BUILD-PLAN.md §5.3, §6.9, defects "placeholder images",
 * "card titles truncate mid-word".
 *
 * Two failures of the grid this replaces are designed out here.
 *
 * Titles wrap to two lines and are clamped at a line boundary, never mid-word.
 * The current system renders the literal text `Spe` on a tile, which tells a
 * cashier nothing and takes a tap to resolve.
 *
 * A collapsed item shows a variant badge instead of one tile per variant
 * (§5.3). `Special Mutton Mix Olive` is one tile that asks Full or Half on tap.
 *
 * The price shown is **tax-exclusive**, matching the menu and the check
 * subtotal (§5.3, §6.9). No tile carries a tax-inclusive figure, because the
 * rate depends on a payment method nobody has chosen yet. That caveat is
 * stated **once**, in the legend above the grid, rather than on all sixty-six
 * tiles: repeated on every tile it is sixty-six repetitions of the same token
 * competing with the figure it qualifies, and a cashier stops reading it by
 * the second row.
 */
export interface ItemGridProps {
  readonly items: readonly MenuItem[];
  readonly imageUrls: Readonly<Record<string, string | null>>;
  /**
   * How many of each item the cart already holds, keyed by `MenuItem.id`.
   * Rendered as a badge on the tile so the "did that tap register?" check
   * happens where the cashier's eyes already are, rather than costing a
   * glance across the full width of the terminal to the cart and back.
   */
  readonly inCartQty?: Readonly<Record<string, number>>;
  readonly onPick: (item: MenuItem) => void;
}

/**
 * A stable tint for an item that has no photograph.
 *
 * Roughly half this menu has no image, and rendering all of them as the same
 * grey fork-and-knife glyph reads as "the images failed to load", not as "this
 * item has no photograph" — the operator's first report on seeing the grid.
 * A deterministic hue plus the item's initials gives every photo-less tile a
 * distinct, intentional-looking face that is also usable as a recognition cue:
 * the same item lands on the same colour every session, on every terminal.
 *
 * Chroma and lightness are fixed and deliberately weak. Only the hue varies,
 * so no tile can come out louder than a real photograph beside it, and the
 * ink stays legible on all 360 of them without a per-hue contrast check.
 */
function placeholderHue(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1)
    hash = (hash * 31 + id.charCodeAt(index)) % 360;
  return hash;
}

/** First letter of each of the first two words — "Zinger Burger" to "ZB". */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}

export function ItemGrid({ items, imageUrls, inCartQty = {}, onPick }: ItemGridProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No items in this category"
        description="Add items in the back office under Menu."
      />
    );
  }

  return (
    <>
      <p className="text-ink-muted px-3 pt-2 text-xs">Prices shown exclude tax.</p>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] content-start gap-2.5 p-3">
        {items.map((item) => {
          const imageUrl = imageUrls[item.id] ?? null;
          const inCart = inCartQty[item.id] ?? 0;

          return (
            <li key={item.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onPick(item)}
                className={cn(
                  'group border-border bg-surface-raised flex h-full w-full flex-col overflow-hidden',
                  'rounded-lg border text-start shadow-sm transition-all duration-200',
                  'hover:border-primary/60 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.98]',
                  'focus-visible:ring-primary focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
                  // R15 — the in-cart state is carried by the badge's number
                  // as well as this ring, never by colour alone.
                  inCart > 0 && 'border-primary ring-primary/40 ring-2',
                )}
              >
                <span className="from-surface-subtle/80 to-surface-raised relative block aspect-square w-full shrink-0 overflow-hidden bg-gradient-to-br">
                  {imageUrl === null ? (
                    <span
                      aria-hidden="true"
                      className="flex size-full items-center justify-center text-2xl font-semibold"
                      style={{
                        // The one place a colour is computed rather than
                        // taken from a token: it is derived from the item's
                        // own id, carries no brand meaning, and so is outside
                        // what R12's brand-grep gate is defending.
                        backgroundColor: `oklch(93% 0.04 ${placeholderHue(item.id)})`,
                        color: `oklch(45% 0.09 ${placeholderHue(item.id)})`,
                      }}
                    >
                      {initials(item.name)}
                    </span>
                  ) : (
                    // R2 and local public assets share this surface; the native image keeps both URL types valid.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl}
                      alt=""
                      width={168}
                      height={168}
                      // Sixty-six images on one screen, of which about a row
                      // and a half are above the fold on a till. The rest are
                      // fetched as the cashier scrolls to them; the fixed
                      // aspect box above means none of it shifts the grid.
                      loading="lazy"
                      decoding="async"
                      className="size-full object-contain p-2 transition-transform duration-200 group-hover:scale-[1.04]"
                    />
                  )}

                  {item.variants.length > 0 && (
                    <span className="text-info bg-info-soft/90 absolute top-1.5 start-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-2xs shadow-sm backdrop-blur-sm">
                      <Layers aria-hidden="true" className="size-3" />
                      {item.variants.length}
                      {/* The bare number reads as a notification count
                          otherwise — it is the number of sizes to choose from. */}
                      <span className="sr-only"> sizes</span>
                    </span>
                  )}

                  {inCart > 0 && (
                    <span className="bg-primary text-primary-ink absolute top-1.5 end-1.5 inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums shadow-sm">
                      {inCart}
                      <span className="sr-only"> on this order</span>
                    </span>
                  )}
                </span>

                <span className="flex min-h-0 flex-1 flex-col px-2.5 py-2">
                  <span className="line-clamp-2 text-sm leading-tight font-semibold break-words">
                    {item.name}
                  </span>
                  {item.nameUr !== null && (
                    <span
                      lang="ur"
                      dir="rtl"
                      className="font-urdu text-ink-muted mt-0.5 line-clamp-1 w-full"
                      style={{ fontSize: '10px', lineHeight: '15px' }}
                    >
                      {item.nameUr}
                    </span>
                  )}
                  <span className="border-border mt-auto block border-t pt-1.5 text-base">
                    {/* "650" alone does not say what it is. The symbol is on
                        the figure the cashier reads aloud to the customer. */}
                    <Money value={item.basePrice} symbol="Rs" trimWholeRupees emphasis="strong" />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
