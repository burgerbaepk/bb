#!/usr/bin/env node
/**
 * R12 — never hardcode restaurant identity. BUILD-PLAN.md §2 R12, §14.5.
 *
 * Restaurant identity is deployment data. This gate keeps trading names,
 * registration numbers, phone numbers, reference addresses, and brand colours
 * out of source so that a new deployment cannot inherit another outlet's data.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['apps', 'packages', 'services', 'tooling', 'scripts'];
const SCAN_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.scss',
  '.json',
  '.html',
  '.svg',
  '.toml',
  '.yml',
  '.yaml',
]);
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  '.turbo',
  '.git',
]);

// §14.5 permits identity in seeds. Migrations contain historical seed data.
const EXCLUDED_PATHS = [
  join('packages', 'db', 'seeds'),
  join('packages', 'db', 'drizzle'),
  // This gate necessarily spells out every pattern it hunts for.
  join('scripts', 'brand-grep.mjs'),
];

// The token layer is the one sanctioned home for literal colour values.
const COLOUR_ALLOWED = [join('packages', 'config', 'tailwind', 'theme.css')];

// The repository directory can retain the reference deployment's name, but it
// must never become rendered identity or a package/import scope.
const SAFE_TOKENS = [/khizer-pos/gi];

const RULES = [
  {
    id: 'trading-name',
    pattern: /khizer/i,
    stripSafe: true,
    message: 'client trading name — resolve it from outlet_config (§5.1)',
  },
  {
    id: 'ntn',
    pattern: /\b[0-9]{7}-[0-9]\b/,
    message: 'NTN shape — resolve it from outlet_config.ntn',
  },
  {
    id: 'strn',
    // Do not mistake a 13-digit run inside a decimal for an STRN.
    pattern: /(?<![0-9.])[0-9]{13}\b/,
    message: 'STRN shape — resolve it from outlet_config.strn',
  },
  {
    id: 'pk-phone',
    pattern: /(\+92[\s-]?[0-9]{3}|\b03[0-9]{2}[\s-]?[0-9]{7}\b)/,
    message: 'Pakistani phone number — resolve it from outlet_config.phone',
  },
  {
    id: 'reference-address',
    pattern: /(gondala\s*wala|gujranwala|chaudhary\s+ali)/i,
    message: 'address or vendor string from the reference deployment (§14.4, K1)',
  },
  {
    id: 'hex-colour',
    pattern: /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/,
    allowIn: COLOUR_ALLOWED,
    message: 'literal hex colour — use a token from @natech/config/tailwind/theme.css (§14.3)',
  },
];

const ALLOW_MARKER = 'brand-grep-allow';

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
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walk(full, out);
    } else {
      const dot = entry.lastIndexOf('.');
      if (dot !== -1 && SCAN_EXTENSIONS.has(entry.slice(dot))) out.push(full);
    }
  }
  return out;
}

function isExcluded(relPath) {
  return EXCLUDED_PATHS.some((path) => relPath.startsWith(path + sep) || relPath === path);
}

const violations = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const relPath = relative(ROOT, file);
    if (isExcluded(relPath)) continue;

    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.includes(ALLOW_MARKER)) return;

      for (const rule of RULES) {
        if (rule.allowIn?.some((path) => relPath === path)) continue;

        let subject = line;
        if (rule.stripSafe) {
          for (const safe of SAFE_TOKENS) subject = subject.replace(safe, '');
        }

        if (rule.pattern.test(subject)) {
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
  console.error(`\nR12 brand-grep FAILED — ${violations.length} violation(s)\n`);
  for (const violation of violations) {
    console.error(`  ${violation.file}:${violation.line}  [${violation.rule}]`);
    console.error(`    ${violation.message}`);
    console.error(`    > ${violation.text}\n`);
  }
  console.error('Restaurant identity is database state, not source. See BUILD-PLAN §14.3, §14.5.');
  console.error(`If an occurrence is genuinely required, mark the line "${ALLOW_MARKER}".\n`);
  process.exit(1);
}

console.log('R12 brand-grep passed: no hardcoded restaurant identity in source.');
