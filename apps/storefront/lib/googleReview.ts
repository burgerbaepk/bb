import type { OutletProfile } from './outlet';

/**
 * The Google review call-to-action — BUILD-PLAN.md §13.5, R12.
 *
 * A printed QR beside the counter is how a restaurant actually collects
 * reviews, so the footer carries the same code a customer can photograph off
 * their own screen. Everything here derives from `outlet_config`; nothing
 * about which listing this is lives in source, which is what R12 and the
 * `brand-grep` gate require.
 *
 * `writereview` rather than the listing URL: it opens straight on the review
 * composer, so the customer is one tap from typing instead of landing on a
 * place page they have to find the button on.
 */
export function googleReviewUrl(outlet: OutletProfile): string | null {
  if (outlet.googlePlaceId === null || outlet.googlePlaceId === '') return null;
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(outlet.googlePlaceId)}`;
}
