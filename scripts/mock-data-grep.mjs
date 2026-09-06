#!/usr/bin/env node
/**
 * Mock-data gate — BUILD-PLAN.md §18 M00, §19, defect C4.
 *
 * The production system this replaces lists "Popular Items" containing dishes
 * that are not on the menu. That is mock data left in a shipped surface. It is
 * a small bug with a large consequence: it teaches staff that the reporting
 * screens are decorative, and then a real reporting error goes unreported.
 *
 * Phase 1 (M04–M06) builds every screen on mock data by design, so this gate
 * does not ban mock data. It bans mock data OUTSIDE the designated locations,
 * and it becomes meaningful the moment Phase 2 wiring starts.
 *
 * Permitted locations:
 *   mocks/ and __mocks__/ directories, test/ and __tests__/ directories,
 *   any file named *.mock.ts, *.fixture.ts, *.test.ts, and packages/db/seeds/
 *
 * The `mock-import` rule (ADR 0025) closes the hole the first four rules left.
 * They all look for a mock *declaration*, so a fixture that stayed politely
 * inside `mocks/` and was simply imported by a shipped screen passed the gate
 * every time. That is exactly how two C4 defects reached production: the POS
 * shell's web-order badge counted `MOCK_WEB_ORDERS`, and the admin settings
 * screen rendered fabricated current values, a fabricated actor and a
 * fabricated audit trail from `MOCK_SETTING_*`. Both were one import line.
 *
 * A path ending in `/mocks` is only ever legitimate from a permitted location,
 * so the rule is about the import path, not about what is imported. Anything
 * under `mocks/` that production genuinely needs is not mock data and belongs
 * in `src/` — `toDomainLines` was moved for exactly that reason.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['apps', 'packages', 'services', 'tooling'];

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.git',
]);

/** Directory names and file suffixes where mock data is expected. */
const ALLOWED_DIR_NAMES = new Set([
  'mocks',
  '__mocks__',
  'test',
  '__tests__',
  'tests',
  'seeds',
  'fixtures',
]);
const ALLOWED_FILE_PATTERN = /\.(mock|fixture|test|spec)\.[tj]sx?$/;

const RULES = [
  {
    id: 'mock-binding',
    pattern: /\b(?:const|let|var|function|export\s+const)\s+(mock|fake|dummy|stub|sample)[A-Z_]/,
    message: 'mock binding outside a designated mock location',
  },
  {
    id: 'lorem',
    pattern: /lorem\s+ipsum/i,
    message: 'placeholder copy',
  },
  {
    id: 'placeholder-host',
    pattern: /(placeholder\.com|via\.placeholder|example\.com|dummyimage\.com|placehold\.it)/i,
    message: 'placeholder asset host',
  },
  {
    id: 'todo-mock',
    // Deliberately case-sensitive: a marker is written in caps, whereas
    // 'hardcoded' appears in ordinary prose and comments.
    pattern: /TODO[_\s-]?MOCK|FIXME[_\s-]?MOCK|\bHARDCODED\b/,
    message: 'explicit mock marker',
  },
  {
    id: 'lorem-name',
    pattern: /\b(John\s+Doe|Jane\s+Doe|Foo\s+Bar|Test\s+User)\b/,
    message: 'placeholder person name',
  },
  {
    id: 'mock-import',
    // `from '@natech/contracts/mocks'`, `from '../../contracts/mocks'`,
    // `from './mocks'`, and the `import(...)`/`require(...)` forms of each.
    pattern: /(?:from|import|require)\s*\(?\s*['"][^'"]*\/mocks(?:\/[^'"]*)?['"]/,
    message: 'production code importing the mock entry point',
  },
];

const ALLOW_MARKER = 'mock-grep-allow';

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else {
      const dot = entry.lastIndexOf('.');
      if (dot !== -1 && SCAN_EXTENSIONS.has(entry.slice(dot))) out.push(full);
    }
  }
  return out;
}

function isAllowedLocation(relPath) {
  const parts = relPath.split(sep);
  if (parts.some((p) => ALLOWED_DIR_NAMES.has(p))) return true;
  const file = parts[parts.length - 1] ?? '';
  return ALLOWED_FILE_PATTERN.test(file);
}

const violations = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const relPath = relative(ROOT, file);
    if (isAllowedLocation(relPath)) continue;

    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.includes(ALLOW_MARKER)) return;
      for (const rule of RULES) {
        if (rule.pattern.test(line)) {
          violations.push({
            file: relPath,
            line: index + 1,
            rule: rule.id,
            message: rule.message,
            text: line.trim().slice(0, 120),
          });
        }
      }
    });
  }
}

if (violations.length > 0) {
  console.error(`\nmock-data-grep FAILED — ${violations.length} violation(s)\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}]`);
    console.error(`    ${v.message}`);
    console.error(`    > ${v.text}\n`);
  }
  console.error('Move it under mocks/, name it *.mock.ts, or delete it. See BUILD-PLAN defect C4.');
  console.error('A [mock-import] hit means the opposite: the fixture is fine, the caller is not.');
  console.error('Wire the surface to real data, or move the helper out of mocks/ into src/.');
  console.error(`If the occurrence is genuine, mark the line "${ALLOW_MARKER}".\n`);
  process.exit(1);
}

console.log('mock-data-grep passed: no mock data outside designated locations.');
