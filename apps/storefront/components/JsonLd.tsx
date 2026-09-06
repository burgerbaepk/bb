/**
 * Renders one `<script type="application/ld+json">` — BUILD-PLAN.md §13.5.
 *
 * `JSON.stringify` on a plain object of strings/numbers/booleans only —
 * `lib/seo/jsonld.ts`'s builders never hand this a `Paisa`/`Qty` bigint
 * (`JSON.stringify` throws on one), which is exactly why that file converts
 * price to a decimal string before this ever sees it.
 */
export function JsonLd({ data }: { readonly data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
