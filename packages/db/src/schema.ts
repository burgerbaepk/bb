import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  time,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { at, baseColumns, counter, paisa } from './columns';

/**
 * The schema — BUILD-PLAN.md §5 in full, plus `fiscal_outbox` from §7.8.
 *
 * Three things this file deliberately does not contain:
 *
 *   - **No `tenant_id`, no `branch_id`.** §1: the deployment is the tenant
 *     boundary. One restaurant, one Vercel project, one Neon database.
 *   - **No tax column on `orders` or `order_lines`.** R9. The rate depends on
 *     how the customer pays, which is not known until payment — there is no
 *     pre-payment estimate document (ADR 0019 removed the printed check); the
 *     authoritative figure is computed once at finalize and lives on
 *     `invoices` and `invoice_tax_lines`. `scripts/tax-column-grep.mjs` fails
 *     CI if a tax column appears anywhere else.
 *   - **No `float` anywhere near money.** R1. Every money column goes through
 *     `paisa()`, which pins Drizzle to `mode: 'bigint'`.
 *
 * Soft delete is universal (R6), so every unique constraint is a partial index
 * `WHERE deleted_at IS NULL`. Without that, deleting a menu item would hold its
 * SKU hostage forever.
 */

/* ------------------------------------------------------------------ enums */

export const posTypeEnum = pgEnum('pos_type', ['PRIMARY', 'SECONDARY']);

/** §14.2 — the three credentials a lockout is counted against, separately. */
export const authAttemptKindEnum = pgEnum('auth_attempt_kind', ['PASSWORD', 'PIN', 'TOTP']);

export const tableShapeEnum = pgEnum('table_shape', [
  'ROUND',
  'SQUARE',
  'RECT',
  'BOOTH',
  'BAR_STOOL',
]);

/** §9.1. Every one of these is rendered with an icon and a label, never colour alone (R15). */
export const tableStatusEnum = pgEnum('table_status', [
  'FREE',
  'RESERVED',
  'SEATED',
  'ORDERED',
  'SERVED',
  'PAYING',
  'CLEANING',
  'BLOCKED',
]);

export const orderChannelEnum = pgEnum('order_channel', ['POS', 'WEB', 'PHONE']);
export const orderTypeEnum = pgEnum('order_type', ['DINE_IN', 'TAKE_AWAY', 'DELIVERY']);
export const orderStatusEnum = pgEnum('order_status', [
  'DRAFT',
  'PLACED',
  'SERVED',
  'FINALIZED',
  'VOIDED',
]);

/** §5.10. The method determines the rate: 16% cash, 8% card and digital. */
export const paymentMethodEnum = pgEnum('payment_method', ['CASH', 'CARD', 'WALLET', 'QR']);

export const invoiceStatusEnum = pgEnum('invoice_status', ['FINALIZED', 'CREDITED']);

/** §5.8. A decline is the event that changes the rate, so it is recorded, not inferred from a gap. */
export const attemptStatusEnum = pgEnum('attempt_status', ['APPROVED', 'DECLINED']);

export const cashMovementTypeEnum = pgEnum('cash_movement_type', ['PAY_IN', 'PAY_OUT', 'DROP']);
export const shiftModeEnum = pgEnum('shift_mode', ['MANUAL', 'AUTO']);
export const shiftStatusEnum = pgEnum('shift_status', ['OPEN', 'CLOSED']);

/**
 * ADR 0026 — a demand sheet's lifecycle. Three values and no more: DRAFT while
 * the manager is still writing it, SUBMITTED once it is handed over and frozen,
 * CANCELLED when a submitted one turns out to be wrong. There is deliberately
 * no RECEIVED — what arrives is an `expenses` row, and reconciling the two is
 * the purchasing module the plan excludes.
 */
export const demandSheetStatusEnum = pgEnum('demand_sheet_status', [
  'DRAFT',
  'SUBMITTED',
  'CANCELLED',
]);

/**
 * ADR 0032 — one day in the attendance book. No `HALF_DAY`, no `LATE`: each is
 * a pay rule dressed as a status, and payroll is excluded by §1.
 */
export const attendanceStatusEnum = pgEnum('attendance_status', [
  'PRESENT',
  'ABSENT',
  'LEAVE',
  'OFF',
]);

/**
 * ADR 0033 — a staff advance entry. Money to the employee, or money back.
 * The balance is the difference and is never stored.
 */
export const staffAdvanceKindEnum = pgEnum('staff_advance_kind', ['ADVANCE', 'RECOVERY']);
/** ADR 0033 — how a recovery came back. Null on an advance. */
export const staffAdvanceMethodEnum = pgEnum('staff_advance_method', [
  'SALARY_DEDUCTION',
  'CASH_RETURN',
]);

/**
 * ADR 0034 — a stock movement. In, out to the kitchen, out to the bin, or a
 * physical count. On-hand is the sum of the deltas and is never stored.
 */
export const stockMovementKindEnum = pgEnum('stock_movement_kind', [
  'RECEIVED',
  'ISSUED',
  'WASTED',
  'COUNTED',
]);

/** §7.8 */
/* ------------------------------------------------------------- 5.1 outlet */

/**
 * Exactly one row, enforced by CHECK. The restaurant's identity lives here and
 * nowhere in source — that is what R12 and the brand-grep gate protect.
 */
export const outletConfig = pgTable(
  'outlet_config',
  {
    ...baseColumns,
    singleton: boolean('singleton').notNull().default(true),

    legalName: text('legal_name').notNull(),
    tradingName: text('trading_name').notNull(),
    address: text('address').notNull(),
    city: text('city').notNull(),
    phone: text('phone').notNull(),
    email: text('email'),

    ntn: text('ntn').notNull(),
    strn: text('strn'),

    timezone: text('timezone').notNull().default('Asia/Karachi'),
    /** §5.8 — `business_date` is derived from this at finalize, never at read time. */
    businessDayCutoff: time('business_day_cutoff').notNull().default('05:00'),

    latitude: numeric('latitude', { precision: 10, scale: 7 }),
    longitude: numeric('longitude', { precision: 10, scale: 7 }),
    storeOpen: time('store_open'),
    storeClose: time('store_close'),
    weeklyOffDays: text('weekly_off_days').array(),

    /**
     * The outlet's Google Business listing — R12 again: a place ID and the
     * rating it earned belong to one deployment, so they are configuration,
     * never source. The storefront renders a review QR from `googlePlaceId`
     * and shows the score only when all three are set.
     *
     * The rating is entered by hand rather than fetched. Reading it live needs
     * a billed Places API key, and a storefront that renders a stale or failed
     * fetch as `0.0` would put a wrong number on a public page — the same
     * class of defect the hero's C4 note guards against. A blank column
     * renders nothing at all.
     */
    googlePlaceId: text('google_place_id'),
    googleRating: numeric('google_rating', { precision: 2, scale: 1 }),
    googleReviewCount: integer('google_review_count'),
  },
  (t) => [
    uniqueIndex('outlet_config_singleton_idx').on(t.singleton),
    check('outlet_config_exactly_one_row', sql`${t.singleton} = true`),
  ],
);

/**
 * §5.1 — tokens live on the relay only. There is deliberately no token column
 * here: the app never holds an authority credential (§7.9).
 */
/* ------------------------------------------------ 5.2 terminals and access */

export const posTerminals = pgTable(
  'pos_terminals',
  {
    ...baseColumns,
    label: text('label').notNull(),
    posType: posTypeEnum('pos_type').notNull().default('PRIMARY'),
    macAddress: text('mac_address'),
    ipAddress: text('ip_address'),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [
    uniqueIndex('pos_terminals_label_idx')
      .on(t.label)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const users = pgTable(
  'users',
  {
    ...baseColumns,
    email: text('email').notNull(),
    passwordHash: text('password_hash'),
    /** §14.2 — 4 to 6 digits, identifying a cashier per till action. */
    pinHash: text('pin_hash'),
    displayName: text('display_name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [
    uniqueIndex('users_email_idx')
      .on(t.email)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const roles = pgTable(
  'roles',
  {
    ...baseColumns,
    key: text('key').notNull(),
    name: text('name').notNull(),
    /** §14.1's capability sentence. The roles screen renders it. */
    description: text('description'),
    permissions: text('permissions')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
  },
  (t) => [
    uniqueIndex('roles_key_idx')
      .on(t.key)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const userRoles = pgTable(
  'user_roles',
  {
    ...baseColumns,
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
  },
  (t) => [
    uniqueIndex('user_roles_unique_idx')
      .on(t.userId, t.roleId)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/** R7 — a row per mutation: actor, entity, action, before, after, IP, user agent. */
export const auditLog = pgTable(
  'audit_log',
  {
    ...baseColumns,
    actorId: uuid('actor_id'),
    entity: text('entity').notNull(),
    entityId: uuid('entity_id'),
    action: text('action').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: text('ip'),
    ua: text('ua'),
    at: at('at').notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_entity_idx').on(t.entity, t.entityId),
    index('audit_log_at_idx').on(t.at),
    index('audit_log_actor_idx').on(t.actorId),
  ],
);

/** R3 — every multi-row mutation carries a key. */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    ...baseColumns,
    key: text('key').notNull(),
    scope: text('scope').notNull(),
    result: jsonb('result'),
  },
  (t) => [uniqueIndex('idempotency_keys_key_idx').on(t.key)],
);

/**
 * §14.2 — the record behind the lockout policy in `@natech/auth`.
 *
 * §5.2 does not list this table. It is here because §14.2 specifies a 4-to-6
 * digit PIN on a terminal that sits on a counter, and ten thousand candidates
 * is a credential only if a wrong one costs something. The policy is pure and
 * lives in `packages/auth/src/lockout.ts`; this is the durable count it reads,
 * which cannot be process memory on a serverless runtime and must survive a
 * deploy.
 *
 * It is deliberately not `audit_log`. R7 records mutations with a before and an
 * after, and a refused login mutated nothing — and a lockout check running a
 * count over a table under a six-year retention obligation (PSTSA s.32(1)) is a
 * query that gets slower every month it is right.
 *
 * `succeeded` rows are kept, not just failures: "failures since the last
 * success" is the count the policy wants, and answering it needs both.
 */
export const authAttempts = pgTable(
  'auth_attempts',
  {
    ...baseColumns,
    kind: authAttemptKindEnum('kind').notNull(),
    /** The user the attempt was made against. Null when the email matched nobody. */
    subjectId: uuid('subject_id').references(() => users.id),
    /** What was typed, for the rows where no user was found. Never a credential. */
    subjectLabel: text('subject_label'),
    terminalId: uuid('terminal_id').references(() => posTerminals.id),
    succeeded: boolean('succeeded').notNull(),
    ip: text('ip'),
    ua: text('ua'),
    at: at('at').notNull().defaultNow(),
  },
  (t) => [
    index('auth_attempts_subject_idx').on(t.subjectId, t.kind, t.at),
    index('auth_attempts_at_idx').on(t.at),
  ],
);

/* ------------------------------------------------------------- 5.3 menu */

export const categories = pgTable(
  'categories',
  {
    ...baseColumns,
    name: text('name').notNull(),
    nameUr: text('name_ur'),
    sortOrder: integer('sort_order').notNull().default(0),
    colour: text('colour'),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [
    uniqueIndex('categories_name_idx')
      .on(t.name)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const taxClasses = pgTable(
  'tax_classes',
  {
    ...baseColumns,
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
  },
  (t) => [
    uniqueIndex('tax_classes_key_idx')
      .on(t.key)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/**
 * §5.3 — `base_price` is **tax-exclusive**. Confirmed against the reference
 * receipt: the menu shows Rs. 530 and the invoice line reads 4 × 530.00 =
 * 2,120.00 against Total (Ex Tax) 12,220.00.
 */
export const menuItems = pgTable(
  'menu_items',
  {
    ...baseColumns,
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id),
    sku: text('sku'),
    name: text('name').notNull(),
    nameUr: text('name_ur'),
    description: text('description'),
    descriptionUr: text('description_ur'),
    imageKey: text('image_key'),
    basePrice: paisa('base_price').notNull(),
    taxClassId: uuid('tax_class_id').references(() => taxClasses.id),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [
    uniqueIndex('menu_items_sku_idx')
      .on(t.sku)
      .where(sql`${t.deletedAt} is null and ${t.sku} is not null`),
    index('menu_items_category_idx').on(t.categoryId),
  ],
);

/**
 * §5.3 — the variant collapse. `Special Mutton Mix Olive` is one item with
 * `Full` and `Half` variants, not two items. Doing this removes about two
 * thirds of the grid tiles and fixes the overflowing category strip.
 */
export const itemVariants = pgTable(
  'item_variants',
  {
    ...baseColumns,
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id),
    name: text('name').notNull(),
    nameUr: text('name_ur'),
    priceDelta: paisa('price_delta')
      .notNull()
      .default(sql`0`),
    isDefault: boolean('is_default').notNull().default(false),
  },
  (t) => [
    uniqueIndex('item_variants_unique_idx')
      .on(t.menuItemId, t.name)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const modifierGroups = pgTable('modifier_groups', {
  ...baseColumns,
  name: text('name').notNull(),
  nameUr: text('name_ur'),
  minSelect: integer('min_select').notNull().default(0),
  maxSelect: integer('max_select').notNull().default(1),
  isRequired: boolean('is_required').notNull().default(false),
});

export const modifiers = pgTable('modifiers', {
  ...baseColumns,
  groupId: uuid('group_id')
    .notNull()
    .references(() => modifierGroups.id),
  name: text('name').notNull(),
  nameUr: text('name_ur'),
  priceDelta: paisa('price_delta')
    .notNull()
    .default(sql`0`),
});

export const itemModifierGroups = pgTable(
  'item_modifier_groups',
  {
    ...baseColumns,
    menuItemId: uuid('menu_item_id')
      .notNull()
      .references(() => menuItems.id),
    groupId: uuid('group_id')
      .notNull()
      .references(() => modifierGroups.id),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    uniqueIndex('item_modifier_groups_unique_idx')
      .on(t.menuItemId, t.groupId)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/* ------------------------------------------------------------ 5.5 floor */

export const zones = pgTable(
  'zones',
  {
    ...baseColumns,
    name: text('name').notNull(),
    nameUr: text('name_ur'),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    backgroundImageKey: text('background_image_key'),
    /** §9.3 — the floor plan renders on a logical grid, never absolute pixels. */
    gridCols: integer('grid_cols').notNull().default(40),
    gridRows: integer('grid_rows').notNull().default(24),
  },
  (t) => [
    uniqueIndex('zones_name_idx')
      .on(t.name)
      .where(sql`${t.deletedAt} is null`),
  ],
);

/**
 * §5.5 — `zone_id` plus `code`, never the old `1 B` / `1 BU` naming (defect V9).
 */
export const tables = pgTable(
  'tables',
  {
    ...baseColumns,
    zoneId: uuid('zone_id')
      .notNull()
      .references(() => zones.id),
    code: text('code').notNull(),
    minSeats: integer('min_seats').notNull().default(2),
    maxSeats: integer('max_seats').notNull().default(4),
    shape: tableShapeEnum('shape').notNull().default('SQUARE'),
    x: integer('x').notNull().default(0),
    y: integer('y').notNull().default(0),
    width: integer('width').notNull().default(3),
    height: integer('height').notNull().default(3),
    rotation: integer('rotation').notNull().default(0),
    status: tableStatusEnum('status').notNull().default('FREE'),
    statusChangedAt: at('status_changed_at'),
    mergedIntoId: uuid('merged_into_id'),
  },
  (t) => [
    uniqueIndex('tables_zone_code_idx')
      .on(t.zoneId, t.code)
      .where(sql`${t.deletedAt} is null`),
    index('tables_status_idx').on(t.status),
  ],
);

/**
 * §5.5 — mandatory. Without it there is no dwell time, no covers count, no
 * table-turn metric, and no waiter attribution across multiple orders on one
 * table, which is most of the §17 Floor Performance report.
 */
export const tableSessions = pgTable(
  'table_sessions',
  {
    ...baseColumns,
    tableId: uuid('table_id')
      .notNull()
      .references(() => tables.id),
    openedAt: at('opened_at').notNull().defaultNow(),
    closedAt: at('closed_at'),
    guestCount: integer('guest_count').notNull().default(0),
    waiterId: uuid('waiter_id').references(() => users.id),
    seatedBy: uuid('seated_by').references(() => users.id),
    closedBy: uuid('closed_by').references(() => users.id),
    mergedGroupId: uuid('merged_group_id'),
    note: text('note'),
  },
  (t) => [
    index('table_sessions_table_idx').on(t.tableId),
    index('table_sessions_open_idx')
      .on(t.tableId)
      .where(sql`${t.closedAt} is null`),
  ],
);

/* ----------------------------------------------------------- 5.6 orders */

/**
 * **No tax column here, and none on `order_lines`.** R9.
 *
 * The authoritative figure is computed once, in the finalize transaction,
 * after the payment method is known, and lives on `invoices`. ADR 0019 —
 * there is no pre-payment estimate document; an order goes straight from
 * SERVED to FINALIZED.
 */
export const orders = pgTable(
  'orders',
  {
    ...baseColumns,
    /** Resets daily. Human-facing, spoken aloud across a counter. */
    orderNo: integer('order_no').notNull(),
    channel: orderChannelEnum('channel').notNull().default('POS'),
    type: orderTypeEnum('type').notNull().default('DINE_IN'),
    tableId: uuid('table_id').references(() => tables.id),
    tableSessionId: uuid('table_session_id').references(() => tableSessions.id),
    /** M20 — the walk-in/named customer attached to this order, if any. */
    customerId: uuid('customer_id').references(() => customers.id),
    waiterId: uuid('waiter_id').references(() => users.id),
    terminalId: uuid('terminal_id').references(() => posTerminals.id),
    guestCount: integer('guest_count'),
    status: orderStatusEnum('status').notNull().default('DRAFT'),
    note: text('note'),
    /**
     * §6.3's reference invoice — "Order discount" sits between line subtotal
     * and taxable base, additive with (not a substitute for) any
     * `order_lines.line_discount`. Added post-freeze (2026-08-27): §5.6's
     * schema as first written omitted it, leaving `DiscountDialog`'s figure
     * applied on screen but never actually reducing what finalize charged —
     * see ADR 0017.
     */
    orderDiscount: paisa('order_discount')
      .notNull()
      .default(sql`0`),
    discountReason: text('discount_reason'),
    /** Null follows the outlet default; 0 disables it for this order; otherwise an invoice-specific rate in basis points. */
    deliveryAddress: text('delivery_address'),
    deliveryCharge: paisa('delivery_charge')
      .notNull()
      .default(sql`0`),
    serviceChargeBpsOverride: integer('service_charge_bps_override'),
    /** §8 — the offline replay idempotency key. */
    clientOrderUuid: uuid('client_order_uuid'),
    businessDate: date('business_date'),
    /** §6.7 — PSTSA s.13 charges the rate in force when the service was provided. */
    serviceStartedAt: at('service_started_at'),
  },
  (t) => [
    uniqueIndex('orders_client_uuid_idx')
      .on(t.clientOrderUuid)
      .where(sql`${t.clientOrderUuid} is not null`),
    uniqueIndex('orders_business_date_no_idx')
      .on(t.businessDate, t.orderNo)
      .where(sql`${t.deletedAt} is null and ${t.businessDate} is not null`),
    index('orders_status_idx').on(t.status),
    index('orders_table_idx').on(t.tableId),
    index('orders_business_date_idx').on(t.businessDate),
  ],
);

/**
 * §5.6 — `name`, `unit_price`, and the three fiscal codes are snapshotted at
 * add time, so a later menu edit cannot alter an invoice that has already been
 * transmitted.
 */
export const orderLines = pgTable(
  'order_lines',
  {
    ...baseColumns,
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    menuItemId: uuid('menu_item_id').references(() => menuItems.id),
    variantId: uuid('variant_id').references(() => itemVariants.id),

    nameSnapshot: text('name_snapshot').notNull(),
    nameUrSnapshot: text('name_ur_snapshot'),

    /** Numeric, not float: 0.5 kg of anything must not drift. */
    qty: numeric('qty', { precision: 10, scale: 3 }).notNull().default('1'),
    unitPrice: paisa('unit_price').notNull(),
    lineDiscount: paisa('line_discount')
      .notNull()
      .default(sql`0`),

    taxClassId: uuid('tax_class_id').references(() => taxClasses.id),
    seatNo: integer('seat_no'),
    note: text('note'),
    voidReason: text('void_reason'),
  },
  (t) => [index('order_lines_order_idx').on(t.orderId)],
);

export const orderLineModifiers = pgTable(
  'order_line_modifiers',
  {
    ...baseColumns,
    orderLineId: uuid('order_line_id')
      .notNull()
      .references(() => orderLines.id),
    modifierId: uuid('modifier_id').references(() => modifiers.id),
    nameSnapshot: text('name_snapshot').notNull(),
    nameUrSnapshot: text('name_ur_snapshot'),
    priceDelta: paisa('price_delta')
      .notNull()
      .default(sql`0`),
  },
  (t) => [index('order_line_modifiers_line_idx').on(t.orderLineId)],
);

/* ------------------------------------------- 5.8 invoices and payments */

/**
 * §5.8 — the fiscal record. Immutable after `status = 'FINALIZED'` except for
 * the fiscal response columns, enforced by the trigger
 * `invoices_immutable_after_finalize` (R5).
 */
export const invoices = pgTable(
  'invoices',
  {
    ...baseColumns,
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    terminalId: uuid('terminal_id').references(() => posTerminals.id),
    /** The register shift that owned this fiscal transaction. */
    shiftId: uuid('shift_id').references(() => shifts.id),

    /** Gap-free, monotonic, never resets, never reused. Allocated under a row lock. */
    localNo: text('local_no').notNull(),
    /** §5.8 — set explicitly at finalize from the cutoff. Never derived at read time (defect C6). */
    businessDate: date('business_date').notNull(),

    subtotal: paisa('subtotal').notNull(),
    discountTotal: paisa('discount_total')
      .notNull()
      .default(sql`0`),
    taxableBase: paisa('taxable_base').notNull(),
    taxTotal: paisa('tax_total').notNull(),
    deliveryCharge: paisa('delivery_charge')
      .notNull()
      .default(sql`0`),
    serviceCharge: paisa('service_charge')
      .notNull()
      .default(sql`0`),
    posFee: paisa('pos_fee')
      .notNull()
      .default(sql`0`),
    roundingAdj: paisa('rounding_adj')
      .notNull()
      .default(sql`0`),
    grandTotal: paisa('grand_total').notNull(),

    /** §6.12 — the rules and policy in force at finalize, frozen. */
    taxSnapshot: jsonb('tax_snapshot').notNull(),

    status: invoiceStatusEnum('status').notNull().default('FINALIZED'),

    printedCount: integer('printed_count').notNull().default(0),
    finalizedBy: uuid('finalized_by').references(() => users.id),
    finalizedAt: at('finalized_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('invoices_local_no_idx').on(t.localNo),
    uniqueIndex('invoices_order_idx').on(t.orderId),
    index('invoices_shift_idx').on(t.shiftId),
    index('invoices_business_date_idx').on(t.businessDate),
  ],
);

/** §6.6 — one row per payment-method slice under PROPORTIONAL allocation. */
export const invoiceTaxLines = pgTable(
  'invoice_tax_lines',
  {
    ...baseColumns,
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    taxClassId: uuid('tax_class_id').references(() => taxClasses.id),
    /** Basis points. Never a float percentage (§5.10). */
    rateBps: integer('rate_bps').notNull(),
    base: paisa('base').notNull(),
    amount: paisa('amount').notNull(),
    paymentMethodScope: paymentMethodEnum('payment_method_scope'),
  },
  (t) => [index('invoice_tax_lines_invoice_idx').on(t.invoiceId)],
);

/**
 * §5.8 — a declined card attempt is recorded, not inferred from a gap. The
 * decline is the event that changes the rate from 8% to 16%, so it has to be
 * visible in the audit trail.
 */
export const payments = pgTable(
  'payments',
  {
    ...baseColumns,
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    method: paymentMethodEnum('method').notNull(),
    amount: paisa('amount').notNull(),
    tendered: paisa('tendered'),
    change: paisa('change'),
    cardLast4: text('card_last4'),
    terminalRef: text('terminal_ref'),
    taxRateAppliedBps: integer('tax_rate_applied_bps'),
    attemptStatus: attemptStatusEnum('attempt_status').notNull().default('APPROVED'),
    declinedReason: text('declined_reason'),
  },
  (t) => [
    index('payments_invoice_idx').on(t.invoiceId),
    index('payments_declined_idx')
      .on(t.createdAt)
      .where(sql`${t.attemptStatus} = 'DECLINED'`),
  ],
);

/** §7.3 — the refund path is `invoiceType: 4`, a credit note. Defect K2 is its absence. */
export const creditNotes = pgTable(
  'credit_notes',
  {
    ...baseColumns,
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    reason: text('reason').notNull(),
    amount: paisa('amount').notNull(),
    issuedBy: uuid('issued_by').references(() => users.id),
  },
  (t) => [index('credit_notes_invoice_idx').on(t.invoiceId)],
);

/**
 * §5.8 — a single row, locked `FOR UPDATE` inside the finalize transaction.
 *
 * Deliberately not a Postgres sequence: sequences leak numbers on rollback, and
 * a fiscal audit asks about gaps.
 */
export const invoiceCounter = pgTable(
  'invoice_counter',
  {
    ...baseColumns,
    singleton: boolean('singleton').notNull().default(true),
    nextValue: counter('next_value')
      .notNull()
      .default(sql`1`),
    prefix: text('prefix').notNull().default('INV-'),
  },
  (t) => [
    uniqueIndex('invoice_counter_singleton_idx').on(t.singleton),
    check('invoice_counter_exactly_one_row', sql`${t.singleton} = true`),
  ],
);

/* ----------------------------------------------------------- 5.9 shifts */

export const shifts = pgTable(
  'shifts',
  {
    ...baseColumns,
    openedBy: uuid('opened_by').references(() => users.id),
    openedAt: at('opened_at').notNull().defaultNow(),
    closedBy: uuid('closed_by').references(() => users.id),
    closedAt: at('closed_at'),
    openingFloat: paisa('opening_float')
      .notNull()
      .default(sql`0`),
    expectedCash: paisa('expected_cash'),
    countedCash: paisa('counted_cash'),
    variance: paisa('variance'),
    notes: text('notes'),
    mode: shiftModeEnum('mode').notNull().default('MANUAL'),
    status: shiftStatusEnum('status').notNull().default('OPEN'),
  },
  (t) => [
    // A database invariant, not an application-level pre-check: concurrent
    // manual/cron opens must never create two live registers.
    uniqueIndex('shifts_single_open_idx')
      .on(t.status)
      .where(sql`${t.status} = 'OPEN'`),
  ],
);

export const cashMovements = pgTable(
  'cash_movements',
  {
    ...baseColumns,
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => shifts.id),
    type: cashMovementTypeEnum('type').notNull(),
    amount: paisa('amount').notNull(),
    reason: text('reason'),
    actorId: uuid('actor_id').references(() => users.id),
  },
  (t) => [index('cash_movements_shift_idx').on(t.shiftId)],
);

/** Operating expenses entered by managers; amounts are positive paisa. */
export const expenses = pgTable(
  'expenses',
  {
    ...baseColumns,
    incurredOn: date('incurred_on').notNull(),
    category: text('category').notNull(),
    vendor: text('vendor'),
    description: text('description').notNull(),
    amount: paisa('amount').notNull(),
    paymentMethod: paymentMethodEnum('payment_method'),
    reference: text('reference'),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => [
    index('expenses_incurred_on_idx').on(t.incurredOn),
    index('expenses_category_idx').on(t.category),
  ],
);

/**
 * Demand order sheets — ADR 0026, docs/runfiles/M23-demand-sheets.md.
 *
 * The paper requisition a manager fills in before the kitchen runs out, and
 * nothing more. Read ADR 0026 before adding a column: the rule there is that
 * this table records **what somebody asked for**, never a fact about the
 * restaurant. `supplier` is free text rather than a foreign key for exactly
 * that reason — a `suppliers` table with terms and contacts is supplier
 * management, which §1 excludes.
 */
export const demandSheets = pgTable(
  'demand_sheets',
  {
    ...baseColumns,
    /** The date the goods are wanted for, not the date the sheet was written. */
    neededBy: date('needed_by').notNull(),
    status: demandSheetStatusEnum('status').notNull().default('DRAFT'),
    supplier: text('supplier'),
    note: text('note'),
    createdBy: uuid('created_by').references(() => users.id),
    /** Set once, when the sheet freezes. Null on a DRAFT, kept on a CANCELLED. */
    submittedAt: at('submitted_at'),
    cancelReason: text('cancel_reason'),
  },
  (t) => [
    index('demand_sheets_needed_by_idx').on(t.neededBy),
    index('demand_sheets_status_idx').on(t.status),
  ],
);

/**
 * A line on a demand sheet — ADR 0026.
 *
 * No `menu_item_id`: ten kilos of mince is not four hundred burgers until
 * somebody writes a recipe, and recipe costing is excluded too.
 */
export const demandSheetLines = pgTable(
  'demand_sheet_lines',
  {
    ...baseColumns,
    sheetId: uuid('sheet_id')
      .notNull()
      .references(() => demandSheets.id),
    item: text('item').notNull(),
    /**
     * Free text — kg, litre, packet, crate. **Nullable since M24**: the
     * restaurant's printed demand sheet has no unit column at all, because
     * everyone in the kitchen knows chicken is kilos and pizza boxes are
     * pieces. Requiring one asked for something the paper never did.
     */
    unit: text('unit'),
    /**
     * The catalogue category this line came from, snapshotted (M24).
     *
     * Snapshotted rather than joined for the same reason as
     * `order_lines.name_snapshot`: a submitted sheet is a frozen document, and
     * recategorising an item next month must not rewrite what a manager handed
     * over in September. Null on an off-list line typed by hand.
     */
    category: text('category'),
    /**
     * Numeric, not float, and for the same reason as `order_lines.qty`: 0.25 kg
     * of saffron must not drift. Read through `@natech/domain`'s `Qty`.
     */
    qty: numeric('qty', { precision: 10, scale: 3 }).notNull().default('1'),
    /**
     * What the manager expects to pay per unit, if they know. Nullable, because
     * a sheet written without today's chicken price is still a valid
     * requisition. R9 is not in play: this is money the restaurant expects to
     * spend, never a taxable amount, and it never reaches `@natech/fiscal`.
     */
    estimatedUnitCost: paisa('estimated_unit_cost'),
    note: text('note'),
  },
  (t) => [index('demand_sheet_lines_sheet_idx').on(t.sheetId)],
);

/**
 * The standing demand catalogue — ADR 0026 (amended by M24),
 * docs/runfiles/M24-demand-catalogue.md.
 *
 * The printed checklist a manager walks the store against: the restaurant's own
 * demand sheet has 144 named items in four columns, and this is that list.
 *
 * **This is not the inventory ADR 0026 refuses, and the line is exact.** That
 * ADR's rule is that the module records what a person asked for, never a fact
 * about the restaurant. A list of item *names* is neither — it is the form
 * itself, the thing already printed on the paper before anybody wrote on it. It
 * carries no quantity on hand, no cost, and no supplier. Adding a
 * `current_stock` or a `preferred_supplier` column here is the step that
 * crosses into the purchasing module the plan excludes; do not take it without
 * a new ADR.
 *
 * Since M28 (ADR 0034) this is also the stock item list. It still gains no
 * stock column: on-hand is the sum of `stock_movements.delta`, never a cell here.
 *
 * The rows live in `packages/db/seeds/demand-items.ts` because they are client
 * data, like the menu (ADR 0012) and unlike anything in `apps/` (R12).
 */
export const demandItems = pgTable(
  'demand_items',
  {
    ...baseColumns,
    name: text('name').notNull(),
    /** Free text, not an enum: the four columns are this client's layout. */
    category: text('category').notNull(),
    /**
     * Null for every seeded item, deliberately. The paper has no unit column,
     * and inventing one for 144 items would put 144 fabricated values on a live
     * screen — the defect class ADR 0025 removed from the settings page.
     */
    defaultUnit: text('default_unit'),
    /** Position on the printed sheet, so the screen reads like the paper. */
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('demand_items_category_idx').on(t.category, t.sortOrder)],
);

/* --------------------------------------------------------- people (M26) */

/**
 * The staff register — ADR 0032, docs/runfiles/M26-attendance.md.
 *
 * Everyone who works in the restaurant, login or not. Deliberately not `users`:
 * the cooks and riders have no email, and a dormant credential per cook is a
 * dozen accounts nobody would notice being used. A person who also runs the
 * till appears in both tables — one is a credential, the other is a person.
 *
 * Owner-only to write (`staff.write`). M27 pays advances against this list,
 * and the ghost-employee fraud needs the same hand to create the person and
 * to pay them; keeping the list with the owner splits the two.
 *
 * No pay column of any kind. A `daily_rate` here is the first line of the
 * payroll module §1 excludes; read ADR 0032 before adding one.
 */
export const employees = pgTable('employees', {
  ...baseColumns,
  name: text('name').notNull(),
  /** Free text — cook, rider, cashier. This client's titles, not an enum. */
  jobTitle: text('job_title'),
  phone: text('phone'),
  /** Off the blank register when false; past days they were marked still show. */
  isActive: boolean('is_active').notNull().default(true),
});

/**
 * One person, one business date — ADR 0032.
 *
 * The paper register in the database: a status, and for a present day
 * optionally the wall-clock times. `time`, not `timestamptz`, because the book
 * says "16:00", not an instant; a time out earlier than the time in is the
 * next morning, which is every closing shift here. See
 * `apps/pos/lib/attendance/register.ts` for the wrap (R13).
 */
export const attendance = pgTable(
  'attendance',
  {
    ...baseColumns,
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    businessDate: date('business_date').notNull(),
    status: attendanceStatusEnum('status').notNull(),
    timeIn: time('time_in'),
    timeOut: time('time_out'),
    note: text('note'),
    recordedBy: uuid('recorded_by').references(() => users.id),
  },
  (t) => [
    // At most one row per person per day. Two managers saving the same day at
    // once get a refusal from the second insert rather than a duplicate.
    uniqueIndex('attendance_employee_date_idx')
      .on(t.employeeId, t.businessDate)
      .where(sql`${t.deletedAt} is null`),
    index('attendance_business_date_idx').on(t.businessDate),
  ],
);

/**
 * The staff advance book — ADR 0033, docs/runfiles/M27-staff-advances.md.
 *
 * One row per movement of money between the restaurant and an employee. The
 * outstanding balance is `Σ ADVANCE − Σ RECOVERY`, derived on read and never
 * stored: a stored balance is a second copy of the truth, and the two disagree
 * the first time a write fails halfway.
 *
 * **Not an expense.** An advance is money the restaurant expects back; writing
 * it to `expenses` would count it again when the full salary is paid.
 *
 * **Not payroll.** No salary, rate or schedule — a `SALARY_DEDUCTION` records
 * that a deduction happened, not how the salary was worked out. Read ADR 0033
 * before adding a column.
 *
 * No edit, no delete: a wrong entry is corrected by a counter-entry, as R5
 * treats the invoice. An advance whose `PAY_OUT` sits in a closed shift cannot
 * be deleted without unbalancing a drawer that has already been counted.
 */
export const staffAdvances = pgTable(
  'staff_advances',
  {
    ...baseColumns,
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => employees.id),
    kind: staffAdvanceKindEnum('kind').notNull(),
    method: staffAdvanceMethodEnum('method'),
    /** Positive paisa (R1). The kind carries the direction, not the sign. */
    amount: paisa('amount').notNull(),
    occurredOn: date('occurred_on').notNull(),
    /**
     * The till movement this entry caused, if the cash went through the
     * drawer. Deliberately no `from_till` flag beside it: a flag and a link
     * can disagree, and the link cannot.
     */
    cashMovementId: uuid('cash_movement_id').references(() => cashMovements.id),
    note: text('note'),
    recordedBy: uuid('recorded_by').references(() => users.id),
  },
  (t) => [
    index('staff_advances_employee_idx').on(t.employeeId),
    index('staff_advances_occurred_on_idx').on(t.occurredOn),
    check('staff_advances_amount_positive', sql`${t.amount} > 0`),
    // A recovery says how it came back; an advance has nothing to say.
    check(
      'staff_advances_method_matches_kind',
      sql`(${t.kind} = 'ADVANCE' and ${t.method} is null) or (${t.kind} = 'RECOVERY' and ${t.method} is not null)`,
    ),
  ],
);

/**
 * The stock ledger — ADR 0034, docs/runfiles/M28-stock-ledger.md.
 *
 * One row per movement of one catalogue item. On-hand is `Σ delta` for the
 * item, derived on read: a stored on-hand is a cell that gets overwritten, and
 * the whole point of a count is to see how far the book and the shelf drifted.
 *
 * `qty` is what the person entered — the amount received, issued or wasted, or
 * for a count the figure found on the shelf. `delta` is the change the row
 * makes to the book; for a count it is counted − book, computed under lock in
 * the action, so the variance stays on record.
 *
 * **No money, and no link to a demand sheet or an expense.** Costing is where
 * recipe costing starts; joining a receipt to what was ordered and what was
 * paid is the three-way match ADR 0026 refused. Read ADR 0034 before adding a
 * column.
 */
export const stockMovements = pgTable(
  'stock_movements',
  {
    ...baseColumns,
    itemId: uuid('item_id')
      .notNull()
      .references(() => demandItems.id),
    kind: stockMovementKindEnum('kind').notNull(),
    /** Numeric, not float — read through `Qty`, like every quantity here. */
    qty: numeric('qty', { precision: 10, scale: 3 }).notNull(),
    delta: numeric('delta', { precision: 10, scale: 3 }).notNull(),
    occurredOn: date('occurred_on').notNull(),
    /** Required on a waste — the reason is the only useful thing about one. */
    note: text('note'),
    recordedBy: uuid('recorded_by').references(() => users.id),
  },
  (t) => [
    index('stock_movements_item_idx').on(t.itemId),
    index('stock_movements_occurred_on_idx').on(t.occurredOn),
    // The sign belongs to the kind. A receipt that lowers the book, or an issue
    // that raises it, is a bug somewhere upstream and is refused here.
    check(
      'stock_movements_delta_matches_kind',
      sql`(${t.kind} = 'RECEIVED' and ${t.qty} > 0 and ${t.delta} = ${t.qty}) or (${t.kind} in ('ISSUED', 'WASTED') and ${t.qty} > 0 and ${t.delta} = -${t.qty}) or (${t.kind} = 'COUNTED' and ${t.qty} >= 0)`,
    ),
    check('stock_movements_waste_has_reason', sql`${t.kind} <> 'WASTED' or ${t.note} is not null`),
  ],
);

/* ------------------------------------------------ 5.10 tax and settings */

/**
 * §5.10 — rates as integer basis points, never a float percentage.
 * §6.7 — resolved against `orders.service_started_at`, not `finalized_at`.
 */
export const taxRules = pgTable(
  'tax_rules',
  {
    ...baseColumns,
    taxClassId: uuid('tax_class_id')
      .notNull()
      .references(() => taxClasses.id),
    paymentMethod: paymentMethodEnum('payment_method'),
    rateBps: integer('rate_bps').notNull(),
    effectiveFrom: at('effective_from').notNull(),
    effectiveTo: at('effective_to'),
    legalReference: text('legal_reference'),
  },
  (t) => [index('tax_rules_lookup_idx').on(t.taxClassId, t.paymentMethod, t.effectiveFrom)],
);

export const settings = pgTable(
  'settings',
  {
    ...baseColumns,
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    updatedBy: uuid('updated_by').references(() => users.id),
  },
  (t) => [uniqueIndex('settings_key_idx').on(t.key)],
);

export const settingHistory = pgTable(
  'setting_history',
  {
    ...baseColumns,
    key: text('key').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    actorId: uuid('actor_id').references(() => users.id),
    at: at('at').notNull().defaultNow(),
    reason: text('reason'),
  },
  (t) => [index('setting_history_key_idx').on(t.key, t.at)],
);

/* -------------------------------------------------------- 5.11 storefront */

export const customers = pgTable(
  'customers',
  {
    ...baseColumns,
    email: text('email'),
    phone: text('phone'),
    name: text('name'),
    /**
     * ADR 0022 — free-form, one field. A delivery address in Pakistan is a
     * house number, a street, a block and an area in whatever order the person
     * writing it uses, and a rider reads it as a sentence rather than as
     * fields. Structuring it would only guarantee the parts arrive in the wrong
     * boxes. Collected once at sign-up (§13.3) and reused on every later order.
     */
    address: text('address'),
    passwordHash: text('password_hash'),
    emailVerifiedAt: at('email_verified_at'),
    marketingOptIn: boolean('marketing_opt_in').notNull().default(false),
  },
  (t) => [
    uniqueIndex('customers_email_idx')
      .on(t.email)
      .where(sql`${t.deletedAt} is null and ${t.email} is not null`),
    /** M20 — the till's find-or-create key for a walk-in or "+"-added customer. */
    uniqueIndex('customers_phone_idx')
      .on(t.phone)
      .where(sql`${t.deletedAt} is null and ${t.phone} is not null`),
  ],
);

/** §13.3 — bcrypt(code + OTP_PEPPER), 10-minute TTL, single use. Never log a code. */
export const otpCodes = pgTable(
  'otp_codes',
  {
    ...baseColumns,
    email: text('email').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: at('expires_at').notNull(),
    consumedAt: at('consumed_at'),
    attemptCount: integer('attempt_count').notNull().default(0),
    ip: text('ip'),
  },
  (t) => [index('otp_codes_email_idx').on(t.email, t.expiresAt)],
);

export const webSessions = pgTable(
  'web_sessions',
  {
    ...baseColumns,
    customerId: uuid('customer_id').references(() => customers.id),
    tableToken: text('table_token'),
    cart: jsonb('cart'),
    expiresAt: at('expires_at').notNull(),
  },
  (t) => [index('web_sessions_customer_idx').on(t.customerId)],
);

export const qrTokens = pgTable(
  'qr_tokens',
  {
    ...baseColumns,
    tableId: uuid('table_id')
      .notNull()
      .references(() => tables.id),
    token: text('token').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    scanCount: integer('scan_count').notNull().default(0),
  },
  (t) => [uniqueIndex('qr_tokens_token_idx').on(t.token)],
);
