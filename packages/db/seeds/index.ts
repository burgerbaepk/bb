import { and, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { closeDb, dbWrite } from '../src/client';
import {
  categories,
  demandItems,
  invoiceCounter,
  menuItems,
  posTerminals,
  roles,
  settings,
  tables,
  taxClasses,
  taxRules,
  zones,
} from '../src/schema';
import { seedVariants } from './menu-variants';
import { ZONES } from './zones';
import { TABLES } from './tables';
import { ROLES } from './roles';
import { TERMINALS } from './terminals';
import { CATEGORIES, MENU_ITEMS } from './menu';
import { TAX_CLASSES, TAX_POLICY, TAX_RULES } from './tax';
import { DEMAND_ITEMS } from './demand-items';

/**
 * Seed reference data — BUILD-PLAN.md §18 M02.
 *
 * Re-runnable: reference data is reconciled without duplication. The menu is
 * intentionally authoritative because a supplied replacement menu must retire
 * the previous catalogue while historical order snapshots remain intact.
 *
 * **`outlet_config` is deliberately not seeded here.** The restaurant's legal
 * name, NTN, STRN, and address are its identity, and §14.6 populates them from
 * prompts in `pnpm brand:init`. Putting them in a committed seed would put
 * client identity in source, which is exactly what R12 and the brand-grep gate
 * exist to prevent.
 */

type Db = ReturnType<typeof dbWrite>;

/**
 * Unwrap the single row an insert should have returned.
 *
 * R11 admits no non-null assertions in this package. That is not pedantry
 * here: an insert that silently returns nothing would otherwise surface as
 * "cannot read id of undefined" halfway through seeding, with no clue which
 * insert failed.
 */
function inserted<T>(rows: readonly T[], what: string): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`seed: inserting ${what} returned no row`);
  }
  return row;
}

async function seedTaxClasses(db: Db): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const cls of TAX_CLASSES) {
    const existing = await db
      .select({ id: taxClasses.id })
      .from(taxClasses)
      .where(sql`${taxClasses.key} = ${cls.key} and ${taxClasses.deletedAt} is null`);

    if (existing[0] !== undefined) {
      ids.set(cls.key, existing[0].id);
      continue;
    }
    const row = await db
      .insert(taxClasses)
      .values({ key: cls.key, name: cls.name, description: cls.description })
      .returning({ id: taxClasses.id });
    ids.set(cls.key, inserted(row, `tax class ${cls.key}`).id);
  }
  return ids;
}

async function seedTaxRules(db: Db, classIds: Map<string, string>): Promise<number> {
  let count = 0;
  for (const rule of TAX_RULES) {
    const classId = classIds.get(rule.taxClassKey);
    if (classId === undefined) continue;

    const existing = await db
      .select({ id: taxRules.id })
      .from(taxRules)
      .where(
        sql`${taxRules.taxClassId} = ${classId}
            and ${taxRules.paymentMethod} is not distinct from ${rule.paymentMethod}
            and ${taxRules.effectiveFrom} = ${rule.effectiveFrom}
            and ${taxRules.deletedAt} is null`,
      );
    if (existing[0] !== undefined) continue;

    await db.insert(taxRules).values({
      taxClassId: classId,
      paymentMethod: rule.paymentMethod,
      rateBps: rule.rateBps,
      effectiveFrom: new Date(rule.effectiveFrom),
      legalReference: rule.legalReference,
    });
    count += 1;
  }
  return count;
}

async function seedCategories(db: Db): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const names = CATEGORIES.map((category) => category.name);
  await db
    .update(categories)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(isNull(categories.deletedAt), notInArray(categories.name, names)));
  for (const category of CATEGORIES) {
    const existing = await db
      .select({ id: categories.id })
      .from(categories)
      .where(sql`${categories.name} = ${category.name} and ${categories.deletedAt} is null`);

    if (existing[0] !== undefined) {
      ids.set(category.name, existing[0].id);
      continue;
    }
    const row = await db
      .insert(categories)
      .values({
        name: category.name,
        nameUr: category.nameUr,
        sortOrder: category.sortOrder,
      })
      .returning({ id: categories.id });
    ids.set(category.name, inserted(row, `category ${category.name}`).id);
  }
  return ids;
}

async function seedMenu(
  db: Db | import('../src/tx').Tx,
  categoryIds: Map<string, string>,
  standardFoodId: string | undefined,
): Promise<{ items: number }> {
  let items = 0;
  // Product image keys refer to version-controlled files in each app's
  // public/images directory; seeding refreshes them from the canonical menu.
  const skus = MENU_ITEMS.map((item) => item.sku);
  await db
    .update(menuItems)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(isNull(menuItems.deletedAt), notInArray(menuItems.sku, skus)));

  for (const item of MENU_ITEMS) {
    const categoryId = categoryIds.get(item.category);
    if (categoryId === undefined) continue;

    const existing = await db
      .select({ id: menuItems.id })
      .from(menuItems)
      .where(sql`${menuItems.sku} = ${item.sku} and ${menuItems.deletedAt} is null`);
    if (existing[0] !== undefined) {
      await db
        .update(menuItems)
        .set({
          categoryId,
          name: item.name,
          nameUr: item.nameUr,
          // Menu copy is seed data like the name beside it: the storefront's
          // one source for it, replaced wholesale when a new menu is supplied.
          description: item.description,
          imageKey: item.imageKey ?? null,
          basePrice: item.basePrice,
          taxClassId: standardFoodId ?? null,
          isActive: item.isActive,
          updatedAt: new Date(),
        })
        .where(eq(menuItems.id, existing[0].id));
      await seedVariants(db, existing[0].id, item.variants ?? []);
      continue;
    }

    const created = await db
      .insert(menuItems)
      .values({
        categoryId,
        sku: item.sku,
        name: item.name,
        nameUr: item.nameUr,
        description: item.description,
        imageKey: item.imageKey ?? null,
        basePrice: item.basePrice,
        taxClassId: standardFoodId ?? null,
        isActive: item.isActive,
      })
      .returning({ id: menuItems.id });
    await seedVariants(db, inserted(created, `menu item ${item.sku}`).id, item.variants ?? []);
    items += 1;
  }

  return { items };
}

async function seedFloor(db: Db): Promise<{ zones: number; tables: number }> {
  const zoneIds = new Map<string, string>();
  let zoneCount = 0;

  for (const zone of ZONES) {
    const existing = await db
      .select({ id: zones.id })
      .from(zones)
      .where(sql`${zones.name} = ${zone.name} and ${zones.deletedAt} is null`);

    if (existing[0] !== undefined) {
      zoneIds.set(zone.name, existing[0].id);
      continue;
    }
    const row = await db
      .insert(zones)
      .values({
        name: zone.name,
        nameUr: zone.nameUr,
        sortOrder: zone.sortOrder,
        gridCols: zone.gridCols,
        gridRows: zone.gridRows,
      })
      .returning({ id: zones.id });
    zoneIds.set(zone.name, inserted(row, `zone ${zone.name}`).id);
    zoneCount += 1;
  }

  let tableCount = 0;
  for (const table of TABLES) {
    const zoneId = zoneIds.get(table.zone);
    if (zoneId === undefined) continue;

    const existing = await db
      .select({ id: tables.id })
      .from(tables)
      .where(
        sql`${tables.zoneId} = ${zoneId} and ${tables.code} = ${table.code} and ${tables.deletedAt} is null`,
      );
    if (existing[0] !== undefined) continue;

    await db.insert(tables).values({
      zoneId,
      code: table.code,
      minSeats: table.minSeats,
      maxSeats: table.maxSeats,
      shape: table.shape,
      x: table.x,
      y: table.y,
      width: table.width,
      height: table.height,
    });
    tableCount += 1;
  }

  return { zones: zoneCount, tables: tableCount };
}

/** §14.2 — a shift binds to a terminal, so one has to exist before a sign-in can. */
async function seedTerminals(db: Db): Promise<number> {
  let count = 0;
  for (const terminal of TERMINALS) {
    const existing = await db
      .select({ id: posTerminals.id })
      .from(posTerminals)
      .where(sql`${posTerminals.label} = ${terminal.label} and ${posTerminals.deletedAt} is null`);
    if (existing[0] !== undefined) continue;

    await db.insert(posTerminals).values({ label: terminal.label, posType: terminal.posType });
    count += 1;
  }
  return count;
}

/**
 * Roles are the one thing here that is reconciled rather than left alone.
 *
 * Everything else in this file is reference data an operator may reasonably
 * have edited. A role is not: §14.1 is its source of truth, the roles screen
 * is read-only, and a stale grant string is a permission that resolves to
 * nothing while still appearing on screen. So a seeded role whose grants no
 * longer match §14.1 is corrected, and the correction is reported.
 */
async function seedRoles(db: Db): Promise<{ created: number; corrected: number }> {
  let created = 0;
  let corrected = 0;

  for (const role of ROLES) {
    const existing = await db
      .select({ id: roles.id, permissions: roles.permissions, description: roles.description })
      .from(roles)
      .where(sql`${roles.key} = ${role.key} and ${roles.deletedAt} is null`);

    const current = existing[0];
    if (current === undefined) {
      await db.insert(roles).values({
        key: role.key,
        name: role.name,
        description: role.description,
        permissions: [...role.permissions],
      });
      created += 1;
      continue;
    }

    const sameGrants =
      current.permissions.length === role.permissions.length &&
      current.permissions.every((value, index) => value === role.permissions[index]);
    if (sameGrants && current.description === role.description) continue;

    await db
      .update(roles)
      .set({
        name: role.name,
        description: role.description,
        permissions: [...role.permissions],
        updatedAt: new Date(),
      })
      .where(eq(roles.id, current.id));
    corrected += 1;
  }

  return { created, corrected };
}

/**
 * The demand sheet catalogue — ADR 0026 (amended), M24.
 *
 * Reconciled the way the menu is, and for the same reason: this is the
 * restaurant's printed checklist, so an item removed from the sheet should stop
 * being offered. Soft-deleted rather than deleted (R6), which keeps it readable
 * on the sheets that already reference it by name.
 *
 * `default_unit` is deliberately not written here — see `demand-items.ts`.
 */
async function seedDemandItems(db: Db): Promise<{ created: number; retired: number }> {
  const names = DEMAND_ITEMS.map((item) => item.name);
  const retired = await db
    .update(demandItems)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(isNull(demandItems.deletedAt), notInArray(demandItems.name, names)))
    .returning({ id: demandItems.id });

  let created = 0;
  for (const item of DEMAND_ITEMS) {
    const existing = await db
      .select({ id: demandItems.id })
      .from(demandItems)
      .where(sql`${demandItems.name} = ${item.name} and ${demandItems.deletedAt} is null`);
    if (existing[0] !== undefined) {
      await db
        .update(demandItems)
        .set({ category: item.category, sortOrder: item.sortOrder, updatedAt: new Date() })
        .where(eq(demandItems.id, existing[0].id));
      continue;
    }
    await db
      .insert(demandItems)
      .values({ name: item.name, category: item.category, sortOrder: item.sortOrder });
    created += 1;
  }
  return { created, retired: retired.length };
}

/** §5.8 — one row, or an invoice can never be numbered. */
async function seedCounters(db: Db): Promise<void> {
  const invoiceRows = await db.select({ id: invoiceCounter.id }).from(invoiceCounter);
  if (invoiceRows.length === 0) {
    await db.insert(invoiceCounter).values({ nextValue: 1n, prefix: 'INV-' });
  }
}

/**
 * §14.3, R12 — the white-label config `readBrandConfig()` resolves at runtime
 * into the root layout's CSS custom properties. Deliberately neutral: R12
 * forbids a real trading name or brand colour in source, so this is a
 * placeholder an owner is expected to replace from the branding screen, not a
 * client's identity checked into the repository. Shaped to satisfy
 * `BrandConfigSchema` (`packages/branding`) without importing it — this
 * package does not depend on `@natech/branding`, and one seed key is not
 * reason enough to add it.
 */
const BRANDING_DEFAULT = {
  identity: {
    tradingName: 'Burger Bae',
    legalName: 'Burger Bae',
    tagline: 'Nobody grills like bae',
    logoLight: '/images/burger-bae-logo.png',
    logoDark: '/images/burger-bae-logo.png',
    logoReceipt: '/images/burger-bae-logo-receipt.png',
    favicon: '/images/burger-bae-icon.png',
  },
  // The wordmark is red on black over white. `primary` is that red and
  // `accent` the wordmark's black; `danger` is deliberately pulled darker and
  // duller than `primary` rather than left at the token layer's default red,
  // which sat close enough to the brand red to make a void or refund button
  // read as the primary action on a till (§4.2).
  theme: {
    primary: 'oklch(58% 0.22 28)',
    surface: 'oklch(99% 0 0)',
    accent: 'oklch(24% 0 0)',
    danger: 'oklch(45% 0.16 22)',
    radius: 'soft',
    mode: 'light',
  },
  // ADR 0020 — the bundled Geist, referenced through the variable each root
  // layout binds rather than by family name: `next/font` mangles the family it
  // registers, so naming "Geist" here would silently resolve to nothing.
  typography: {
    display: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
    body: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
    mono: 'var(--font-geist-mono), ui-monospace, monospace',
    urdu: 'Mehr Nastaliq Web, serif',
  },
  locale: {
    default: 'en',
    enabled: ['en'],
    currency: 'PKR',
    timezone: 'Asia/Karachi',
  },
  receipt: {
    widthMm: 80,
    headerLines: [],
    footerLines: [],
    showUrdu: false,
    paymentDetails: {
      bankName: '',
      iban: '',
      accountNumber: '',
      jazzCash: '',
      easyPaisa: '',
    },
  },
} as const;

async function seedSettings(db: Db): Promise<void> {
  const entries: ReadonlyArray<[string, unknown]> = [
    ['tax.policy', TAX_POLICY],
    ['storefront.sessionDays', 90],
    // §14.2 — how long a bound terminal stays unlocked between till actions
    // before the PIN is required again. M07 reads this on every till action, and
    // a missing row would have to mean something; a seeded five minutes is a
    // better default than an implicit "never re-lock".
    ['security.idleLockSeconds', 300],
    ['offline.maxQueuedOrders', 200],
    // §14.3 — the root layout resolves this into CSS custom properties on
    // every request (M08). `readBrandConfig()` falls back to the same neutral
    // placeholder if this row is ever missing, so seeding it is a courtesy
    // that keeps a fresh deployment's first render off the fallback path.
    ['branding', BRANDING_DEFAULT],
  ];

  for (const [key, value] of entries) {
    const existing = await db
      .select({ id: settings.id })
      .from(settings)
      .where(eq(settings.key, key));
    if (existing[0] !== undefined) continue;
    await db.insert(settings).values({ key, value: value as object });
  }
}

async function main(): Promise<void> {
  const db = dbWrite();

  const classIds = await seedTaxClasses(db);
  const rules = await seedTaxRules(db, classIds);
  const categoryIds = await seedCategories(db);
  const menu = await db.transaction((tx) =>
    seedMenu(tx, categoryIds, classIds.get('STANDARD_FOOD')),
  );
  const floor = await seedFloor(db);
  const terminalCount = await seedTerminals(db);
  const roleSummary = await seedRoles(db);
  const demand = await seedDemandItems(db);
  await seedCounters(db);
  await seedSettings(db);

  console.warn(
    [
      'seeded:',
      `  tax classes   ${classIds.size}`,
      `  tax rules     ${rules} new`,
      `  categories    ${categoryIds.size}`,
      `  menu items    ${menu.items} new`,
      `  zones         ${floor.zones} new`,
      `  tables        ${floor.tables} new`,
      `  terminals     ${terminalCount} new`,
      `  roles         ${roleSummary.created} new, ${roleSummary.corrected} corrected`,
      `  demand items  ${demand.created} new, ${demand.retired} retired`,
      '  counters, settings ok',
      '',
      'outlet_config is NOT seeded: it is client identity and comes from',
      "pnpm brand:init (§14.6). Menu is the restaurant's full price list — see ADR 0012.",
    ].join('\n'),
  );

  await closeDb();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
