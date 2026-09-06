#!/usr/bin/env node
/**
 * R8 — generate and commit migration SQL. BUILD-PLAN.md §2 R8.
 *
 * `drizzle-kit push` diffs a schema against a live database and applies the
 * result. Against production that is an unreviewed migration: it can drop a
 * column holding six years of fiscal records that PSTSA s.32(1) requires be
 * retained. Every schema change must arrive as reviewed SQL in the same commit.
 *
 * This gate fails when `packages/db/src/schema.ts` changed in the range and no
 * file under `packages/db/drizzle/` changed with it.
 *
 * Usage:
 *   node scripts/migration-diff.mjs            # against the merge base, or HEAD~1
 *   node scripts/migration-diff.mjs <base-ref>
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const SCHEMA_PATH = 'packages/db/src/schema.ts';
const MIGRATIONS_DIR = 'packages/db/drizzle/';

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

// M00 ships this gate before the schema it guards. Until M02 creates the
// schema there is nothing to compare, and the gate passes rather than
// blocking every commit with a failure nobody can fix yet.
if (!existsSync(SCHEMA_PATH)) {
  console.log(`R8 migration-diff skipped: ${SCHEMA_PATH} does not exist yet (lands in M02).`);
  process.exit(0);
}

const explicitBase = process.argv[2];
let base = explicitBase ?? null;

if (base === null) {
  const target = process.env.GITHUB_BASE_REF;
  if (target) {
    git(['fetch', '--no-tags', '--depth=50', 'origin', target]);
    base = git(['merge-base', 'HEAD', `origin/${target}`]);
  }
}

if (base === null) {
  base = git(['rev-parse', 'HEAD~1']);
}

if (base === null) {
  console.log('R8 migration-diff skipped: no comparable base commit (shallow or first commit).');
  process.exit(0);
}

const changed = git(['diff', '--name-only', base, 'HEAD']);
if (changed === null) {
  console.error(`R8 migration-diff: could not diff against ${base}`);
  process.exit(1);
}

const files = changed.split('\n').filter(Boolean);
const schemaChanged = files.includes(SCHEMA_PATH);
const migrationChanged = files.some((f) => f.startsWith(MIGRATIONS_DIR) && f.endsWith('.sql'));

if (schemaChanged && !migrationChanged) {
  console.error('\nR8 migration-diff FAILED\n');
  console.error(`  ${SCHEMA_PATH} changed, but no .sql file under ${MIGRATIONS_DIR} did.\n`);
  console.error('  Generate the migration and commit it with the schema change:');
  console.error('      pnpm --filter @natech/db drizzle-kit generate\n');
  console.error('  Never run drizzle-kit push against production — an unreviewed');
  console.error('  migration can drop records that PSTSA s.32(1) requires be kept');
  console.error('  for six years. See BUILD-PLAN §2 R8.\n');
  process.exit(1);
}

if (schemaChanged) {
  console.log('R8 migration-diff passed: schema change ships with migration SQL.');
} else {
  console.log('R8 migration-diff passed: no schema change in range.');
}
