/**
 * Join class names, dropping anything falsy.
 *
 * Deliberately not `clsx` or `tailwind-merge`: nothing here needs conflict
 * resolution, and a dependency that rewrites class strings at runtime would
 * defeat the `natech/no-physical-direction` lint rule, which reads them
 * statically.
 */
export type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
