import { Star } from 'lucide-react';

/**
 * The Google Business score — BUILD-PLAN.md §13.1, §13.5.
 *
 * `StoreHero` used to carry a note explaining why there was no rating here:
 * this product has no reviews table, so any star it drew would have been a
 * figure it invented, which is defect C4. That objection was to a *fabricated*
 * number and it still stands. This one is not fabricated — it is the score the
 * outlet's own Google listing shows, entered in Settings and linked back to
 * the listing it came from, so a customer can check it against the source in
 * one tap.
 *
 * The caller renders nothing when the columns are unset, so an outlet that has
 * not filled them in shows no stars rather than a zero-star review.
 *
 * No framework or server import: the hero renders this on the server and the
 * footer inside a client component.
 */
/**
 * One decimal, always: `4` reads as an integer count, `4.0` as a score.
 *
 * `Intl.NumberFormat` rather than `toFixed` — R1 bans `toFixed` outright
 * because it is how a float ends up formatting money, and a lint rule cannot
 * tell a rating from a rupee. This is not money: it never touches Paisa and
 * never reaches an invoice.
 */
export function formatRating(rating: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(rating);
}

export function GoogleRating({
  rating,
  count,
  href,
  tone = 'dark',
  label,
  reviewsLabel,
}: {
  readonly rating: number;
  readonly count: number | null;
  readonly href: string | null;
  /** Which ground it sits on: `dark` is the footer, `light` the hero. */
  readonly tone?: 'dark' | 'light';
  readonly label: string;
  readonly reviewsLabel: string;
}) {
  const clamped = Math.max(0, Math.min(5, rating));
  const body = (
    <>
      <span className="font-semibold tabular-nums">{formatRating(clamped)}</span>
      {/* Five hollow stars with a filled copy clipped over them. A whole-star
          loop would round 4.4 up to a fifth star the listing never gave. */}
      <span className="relative inline-flex" aria-hidden="true">
        <Stars className={tone === 'dark' ? 'text-white/30' : 'text-store-muted/35'} />
        <span
          className="absolute inset-y-0 start-0 overflow-hidden"
          style={{ width: `${(clamped / 5) * 100}%` }}
        >
          {/* Google's own star gold, not a token. This is the one colour on
              the storefront that must NOT follow the brand: `accent` is the
              client's colour, and drawing a Google score in the restaurant's
              red would present Google's rating as the restaurant's own claim.
              Not restaurant identity, so not what §14.3 is protecting. */}
          <Stars className="fill-current text-[#fbbc04]" /> {/* brand-grep-allow */}
        </span>
      </span>
      {count !== null && (
        <span className={tone === 'dark' ? 'text-white/60' : 'text-store-muted'}>
          {reviewsLabel}
        </span>
      )}
    </>
  );

  const className = `inline-flex items-center gap-1.5 text-sm ${
    tone === 'dark' ? 'text-white/85' : 'text-store-ink'
  }`;

  if (href === null) {
    return (
      <p className={className} aria-label={label}>
        {body}
      </p>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`${className} hover:underline hover:underline-offset-4`}
      aria-label={label}
    >
      {body}
    </a>
  );
}

function Stars({ className }: { readonly className: string }) {
  return (
    <span className={`flex ${className}`}>
      {[0, 1, 2, 3, 4].map((index) => (
        <Star key={index} className="size-3.5 shrink-0" strokeWidth={1.5} />
      ))}
    </span>
  );
}
