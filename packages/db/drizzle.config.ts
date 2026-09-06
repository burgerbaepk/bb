import { defineConfig } from 'drizzle-kit';
import { databaseUrls } from './src/env';

/**
 * Drizzle Kit — BUILD-PLAN.md §2 R8.
 *
 * `generate` only. **Never `push`.** `drizzle-kit push` diffs against a live
 * database and applies the result unreviewed, which against production can drop
 * a column holding six years of fiscal records that PSTSA s.32(1) requires be
 * retained. Every schema change ships as reviewed SQL in the same commit, and
 * `scripts/migration-diff.mjs` fails CI otherwise.
 */
export default defineConfig({
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: { url: databaseUrls().write },
  strict: true,
  verbose: true,
});
