/**
 * Derived identifiers — BUILD-PLAN.md §5.3; docs/runfiles/M08-menu-floor-brand.md.
 *
 * `categories.slug` and `menu_items.slug` are frozen contract fields
 * (`packages/contracts`) with no column to back them in the M02 schema.
 * Storing a second field that has to be kept in step with `name` drifts the
 * first time somebody is renamed — the exact reasoning
 * `lib/auth/queries.ts`'s `initialsOf()` already applies to a display name —
 * so these are derived from `name` at read time instead.
 */

export function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug === '' ? 'item' : slug;
}
