import { bigint, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Shared column shapes — BUILD-PLAN.md §5, §2 R1, R6.
 *
 * §5: "All tables carry `id uuid primary key default gen_random_uuid()`,
 * `created_at`, `updated_at`, `deleted_at`."
 */

/** Every table. R6 soft-deletes everything, so `deletedAt` is not optional. */
export const baseColumns = {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};

/**
 * R1 — a money column.
 *
 * `mode: 'bigint'` is the entire point. Drizzle defaults a `bigint` column to
 * `mode: 'number'`, which hands back a JavaScript float and undoes R1 at the
 * driver boundary without anything failing. Declaring money through this helper
 * means the mode cannot be forgotten on one column out of sixty.
 */
export function paisa(name: string) {
  return bigint(name, { mode: 'bigint' });
}

/** A timestamptz. Named for symmetry with `paisa` so column decls read alike. */
export function at(name: string) {
  return timestamp(name, { withTimezone: true });
}

/**
 * A monotonic counter value (§5.8). Same storage as paisa() — bigint with
 * mode bigint — but it is a sequence position, not money, and reads better
 * spelled that way at the call site.
 */
export function counter(name: string) {
  return bigint(name, { mode: 'bigint' });
}
