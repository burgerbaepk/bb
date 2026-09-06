#!/usr/bin/env node
/**
 * R9 — tax is computed once, at finalize. BUILD-PLAN.md §2 R9, §5.6, §6.9,
 * §18 (M02 gate); ADR 0019.
 *
 * The M02 gate originally read: "No tax column exists outside `order_checks`,
 * `invoices`, and `invoice_tax_lines`." ADR 0019 removed the pre-payment
 * check (`order_checks`) outright, so the only tables left that may ever hold
 * a settled figure are `invoices` and `invoice_tax_lines`.
 *
 * That needs one distinction the sentence does not make, and getting it wrong in
 * either direction breaks something:
 *
 *   A **tax classification pointer** (`tax_class_id`) says which rate schedule a
 *   thing belongs to. §5.3 puts one on `menu_items` and §5.6 puts one on
 *   `order_lines` — the plan's own schema. Banning it would contradict §5.
 *
 *   A **computed tax value** (`tax_total`, `tax_amount`, `taxable_base`) is an
 *   answer, and where it is stored decides when it was computed. R9 exists to
 *   stop that answer being computed before the payment method is known, because
 *   the method sets the rate: 16% on cash against 8% on card, a Rs. 977.60 gap
 *   on the reference order. An `orders.tax_total` column is an invitation to
 *   fill it in at add-to-cart, and then the screen and the invoice disagree.
 *
 * So: classification pointers are allowed anywhere. Computed tax values are
 * allowed only on the tables that hold a settled figure.
 *
 * Static analysis of `schema.ts`, so it runs in CI with no database.
 */
import { existsSync, readFileSync } from 'node:fs';

const SCHEMA_PATH = 'packages/db/src/schema.ts';

/** §18 M02, ADR 0019 — the only tables that may hold a computed tax value. */
const TABLES_ALLOWED_TAX_VALUES = new Set(['invoices', 'invoice_tax_lines']);

/** Classification and rate-reference columns. Not an amount. */
const CLASSIFICATION_COLUMNS = new Set([
  'tax_class_id',
  'tax_classes',
  'tax_rules',
  'tax_rate_applied_bps',
]);

/** A column name that reads as a computed tax figure. */
const TAX_VALUE = /(^|_)(tax|vat|gst)(_|$)|taxable/i;

if (!existsSync(SCHEMA_PATH)) {
  console.log(`R9 tax-column-grep skipped: ${SCHEMA_PATH} does not exist yet (lands in M02).`);
  process.exit(0);
}

const source = readFileSync(SCHEMA_PATH, 'utf8');

/**
 * Pull out each `pgTable('name', { ... })` block. Brace-counting rather than a
 * regex, because the column object contains nested braces.
 */
function extractTables(text) {
  const found = [];
  const opener = /pgTable\(\s*'([a-z_]+)'\s*,\s*\{/g;
  let match;
  while ((match = opener.exec(text)) !== null) {
    const tableName = match[1];
    let depth = 1;
    let i = opener.lastIndex;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth += 1;
      else if (text[i] === '}') depth -= 1;
      i += 1;
    }
    found.push({ tableName, body: text.slice(opener.lastIndex, i - 1) });
  }
  return found;
}

/** Column names as written in the database, from `name: type('db_name')`. */
function columnNames(body) {
  const names = [];
  const decl = /^\s*([A-Za-z0-9_]+)\s*:\s*[A-Za-z0-9_]+\(\s*'([a-z0-9_]+)'/gm;
  let match;
  while ((match = decl.exec(body)) !== null) {
    names.push({ property: match[1], column: match[2] });
  }
  return names;
}

const violations = [];

for (const { tableName, body } of extractTables(source)) {
  if (TABLES_ALLOWED_TAX_VALUES.has(tableName)) continue;

  for (const { property, column } of columnNames(body)) {
    if (CLASSIFICATION_COLUMNS.has(column)) continue;
    if (!TAX_VALUE.test(column)) continue;

    violations.push({ tableName, property, column });
  }
}

if (violations.length > 0) {
  console.error(`\nR9 tax-column-grep FAILED — ${violations.length} violation(s)\n`);
  for (const v of violations) {
    console.error(`  ${v.tableName}.${v.column}  (property ${v.property})`);
  }
  console.error(
    '\n  A computed tax value may live only on invoices or invoice_tax_lines.\n' +
      '  Anywhere else it gets filled in before the payment method is known,\n' +
      '  and the method sets the rate — 16% cash against 8% card. See\n' +
      '  BUILD-PLAN §2 R9 and §6.9, and ADR 0019.\n',
  );
  process.exit(1);
}

console.log('R9 tax-column-grep passed: no computed tax value outside the settled tables.');
