# khizer-pos — Build Plan v2.1

**Repository root:** `khizer-pos/`
**Vendor:** NA Technologies Ltd, Glasgow (SC833018)
**Product:** standalone restaurant POS, one restaurant per deployment, re-brandable per client
**Compliance:** Punjab Revenue Authority + FBR Digital Invoicing (PRAL)

This document supersedes v1.0, v1.1, v2.0, and Addendum A. It is the single source of truth. Every runfile derives from it. Where this document and any earlier version disagree, this document wins.

**Change in v2.1:** the invoice lifecycle is now two documents — a pre-payment **check** carrying full tax and total, and a post-payment **tax invoice** carrying the fiscal numbers and QR. See §6. This replaces the v2.0 rule that suppressed tax before finalization.

---

## 0. How To Execute This Plan

1. Create an empty folder named `khizer-pos`.
2. Place this file at `khizer-pos/docs/BUILD-PLAN.md` before writing any code.
3. Complete §20 pre-flight tasks. Start P1, P2, P3, P5, and P6 during M00.
4. Run one milestone per Claude Code session. Never combine milestones.
5. Write each milestone's runfile to `docs/runfiles/M<nn>-<slug>.md` before starting it.
6. Do not start a milestone until the previous milestone's gate passes.
7. Do not renegotiate a data contract after the Phase 1 freeze at the end of M06.

---

## 1. Scope

**Build:** POS terminal with offline capability, table floor plan, kitchen display, admin back office, tax engine, PRA and FBR fiscal transmission, shift and cash reconciliation, reporting, QR self-order storefront, white-label configuration, Urdu support.

**Do not build:** inventory, recipe costing, purchasing, supplier management, payroll, loyalty, online payment gateway, delivery dispatch, aggregator integrations, multi-branch, multi-tenancy.

The deployment is the tenant boundary. One restaurant gets one Vercel project, one Neon database, one R2 bucket prefix, one Resend domain. Do not add `tenant_id` or `branch_id` to any table.

---

## 2. Non-Negotiable Rules

Enforce each rule with the stated mechanism. A violation fails CI.

| # | Rule | Enforcement |
|---|---|---|
| R1 | Represent all money as `bigint` paisa. Use the branded type `Paisa`. Format only at the render boundary. Convert for fiscal transmission only through `toFiscalDecimal()`. | ESLint `no-restricted-syntax`; all money columns `bigint` |
| R2 | Perform every write through `dbWrite` (Neon WebSocket `Pool`). Use `dbRead` (HTTP driver) for RSC reads only. The HTTP driver silently no-ops multi-statement transactions. | Lint rule bans `dbRead` in `/actions/**` and mutation route handlers |
| R3 | Attach an idempotency key to every multi-row mutation. | `idempotency_keys` table; `withIdempotency()` |
| R4 | Validate every state transition server-side against an explicit state machine. Reject illegal transitions. | `packages/domain/src/state-machines/*`, exhaustive switch |
| R5 | Never `UPDATE` an invoice after `status = 'FINALIZED'` except the fiscal response columns. | Postgres trigger `invoices_immutable_after_finalize` |
| R6 | Soft-delete everything. Never hard-delete a record referenced by an invoice or a check. | Drizzle mixin; partial unique indexes `WHERE deleted_at IS NULL` |
| R7 | Write an audit row for every mutation: actor, entity, action, before, after, IP, user agent. | `withAudit()` |
| R8 | Generate and commit migration SQL. Never run `drizzle-kit push` against production. | CI blocks a `schema.ts` change without a matching `drizzle/*.sql` |
| R9 | **A check shows estimated tax and is never a tax invoice. Authoritative tax is computed once, in the finalize transaction, after payment is recorded.** See §6. | `orders` has no tax column; check totals live only on `order_checks`; fiscal fields only on `invoices` |
| R10 | **Transmit to PRA and FBR only from a finalized invoice.** Never transmit a check. | `fiscal_outbox` accepts only `invoice_id` or `credit_note_id` |
| R11 | Set TypeScript to strict. Zero `any`. Zero non-null assertions in `packages/domain`, `packages/db`, `packages/fiscal`. | tsconfig + `@typescript-eslint/no-explicit-any: error` |
| R12 | Never hardcode restaurant identity: name, NTN, STRN, address, phone, brand colour. | CI grep gate, §14.5 |
| R13 | Never render a negative duration. | Lint rule on duration formatters; unit test |
| R14 | Never render a monetary value on any KDS surface. | Component test |
| R15 | Pair every colour-coded state with an icon and a text label. | Accessibility test in `/_ds` |
| R16 | Derive a header count and a header sum from the same query as the list they head. | Integration test per screen |
| R17 | Print `NOT A TAX INVOICE` on every check. Never print a fiscal number, a QR code, or the PRA logo on a check. | Receipt renderer test |

---

## 3. Repository

```
khizer-pos/
├─ apps/
│  ├─ pos/                    # terminal + admin. PWA, offline, noindex
│  ├─ storefront/             # public menu + QR self-order. ISR, SEO
│  └─ kds/                    # kitchen display. Fullscreen, token-scoped
├─ packages/
│  ├─ db/                     # Drizzle schema, migrations, clients, seeds
│  ├─ domain/                 # tax, pricing, state machines, money. No framework imports
│  ├─ fiscal/                 # PRA + FBR adapters, payload builders, code maps, QR
│  ├─ branding/               # white-label config resolution and theme injection
│  ├─ ui/                     # design system
│  ├─ contracts/              # Zod schemas shared across apps and the service worker
│  └─ config/                 # eslint, tsconfig, tailwind preset
├─ services/
│  └─ fiscal-relay/           # fixed-IP egress service, deployed separately. §7.9
├─ tooling/
│  └─ print-bridge/           # local ESC/POS agent
└─ docs/
   ├─ BUILD-PLAN.md
   ├─ runfiles/               # M00-foundation.md … M19-pilot.md
   └─ decisions/              # ADRs, one per material choice
```

`packages/domain` imports nothing from Next.js, React, or Drizzle. The tax engine runs identically on the server and inside the POS service worker. Any framework import there breaks the offline path.

### 3.1 Bootstrap (M00)

```bash
mkdir khizer-pos && cd khizer-pos
pnpm init
pnpm add -D turbo typescript @types/node
# create apps and packages per the tree above
# each app: pnpm create next-app --typescript --app --tailwind --eslint --no-src-dir
```

Pin the pnpm version in `packageManager`. Commit the lockfile.

---

## 4. Environment Variables

Create `.env.example` in M00 with every variable below and no real values.

```bash
# Database
NEON_DATABASE_URL=                 # WebSocket pooled — all writes
NEON_DATABASE_URL_HTTP=            # HTTP driver — RSC reads only

# Auth
AUTH_SECRET=
AUTH_URL=
ENCRYPTION_KEY=                    # AES-256 key for credentials at rest
OTP_PEPPER=

# Storage
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=

# Email
RESEND_API_KEY=
RESEND_FROM_TRANSACTIONAL=
RESEND_FROM_OTP=                   # dedicated subdomain, §13.3

# Cache, queue, realtime
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Fiscal — the app never holds an authority token
FISCAL_RELAY_URL=
FISCAL_RELAY_SECRET=

# Observability
SENTRY_DSN=
SENTRY_ENVIRONMENT=

# URLs
NEXT_PUBLIC_STOREFRONT_URL=
NEXT_PUBLIC_POS_URL=
```

`services/fiscal-relay/.env.example`:

```bash
FBR_MODE=SANDBOX
FBR_TOKEN=
PRA_MODE=SANDBOX
PRA_TOKEN=
RELAY_SHARED_SECRET=
ALLOWED_ORIGINS=
```

---

## 5. Data Model

All tables carry `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, `deleted_at timestamptz`.

### 5.1 Outlet

```
outlet_config                       -- exactly one row, enforced by CHECK
  legal_name, trading_name, address, city, phone, email,
  ntn, strn, pra_registration_no,
  timezone default 'Asia/Karachi',
  business_day_cutoff time default '05:00',
  latitude numeric, longitude numeric,
  store_open time, store_close time, weekly_off_days text[]

fiscal_credentials
  authority enum('PRA','FBR'), mode enum('SANDBOX','PRODUCTION'),
  relay_url, is_active, updated_by
  -- tokens live on the relay only. Never store an authority token here.
```

### 5.2 Terminals and access

```
pos_terminals  label, fbr_pos_id, pos_type enum('PRIMARY','SECONDARY'),
               mac_address, ip_address, print_station_id, is_active
users          email, password_hash, pin_hash, display_name, totp_secret, is_active
roles          key, name, permissions text[]
user_roles     user_id, role_id
audit_log      actor_id, entity, entity_id, action, before jsonb, after jsonb, ip, ua, at
idempotency_keys  key unique, scope, result jsonb, created_at
```

### 5.3 Menu

`menu_items.base_price` is **tax-exclusive**. Confirmed against the reference receipt: menu shows Rs. 530, invoice line reads `4 × 530.00 = 2,120.00` against `Total (Ex Tax) 12,220.00`.

```
categories    name, name_ur, sort_order, colour, station_id, is_active
menu_items    category_id, sku, name, name_ur, description, description_ur,
              image_key, base_price bigint, tax_class_id, station_id,
              fbr_hs_code, fbr_uom_code, fbr_sale_type, sort_order, is_active
item_variants menu_item_id, name, name_ur, price_delta bigint, is_default
modifier_groups       name, name_ur, min_select, max_select, is_required
modifiers             group_id, name, name_ur, price_delta bigint
item_modifier_groups  menu_item_id, group_id, sort_order
```

Seed the menu as items plus variants. Seed one item `Special Mutton Mix Olive` with variants `Full` and `Half`, not two items. Apply the same collapse to Butter, Pickle, Black Pepper, Machli Olive, and Machli Butter. This removes roughly two thirds of the grid tiles and fixes the overflowing category strip.

### 5.4 Stations

```
stations  name, name_ur, sort_order, colour,
          target_prep_seconds int, warn_seconds int, overdue_seconds int,
          printer_station_id, is_active
```

Seed five stations and map the existing categories:

| Station | Categories |
|---|---|
| `GRILL` | 01 Mutton BBQ, 03 Taka Tak, 04 Mutton Steam Roast, 05 Chicken BBQ, 07 Chicken |
| `KARAHI` | 02 Mutton Karahi, 06 Winter |
| `TANDOOR` | 11 Tandoor |
| `COLD` | 08 Raita / Salad, 09 Desserts, Raita, Extra |
| `BEVERAGE` | 10 Drinks |

### 5.5 Floor

```
zones   name, name_ur, sort_order, is_active,
        background_image_key, grid_cols int default 40, grid_rows int default 24

tables  zone_id, code, min_seats int, max_seats int,
        shape enum('ROUND','SQUARE','RECT','BOOTH','BAR_STOOL'),
        x int, y int, width int, height int, rotation int,
        status enum('FREE','RESERVED','SEATED','ORDERED','SERVED',
                    'CHECK_PRINTED','PAYING','CLEANING','BLOCKED') default 'FREE',
        status_changed_at timestamptz,
        merged_into_id uuid references tables(id)

table_sessions
        table_id, opened_at, closed_at, guest_count, waiter_id,
        seated_by, closed_by, merged_group_id uuid, note
```

`table_sessions` is mandatory. Without it there is no dwell time, no covers count, no table-turn metric, and no waiter attribution across multiple orders on one table.

Do not carry the existing codes `1 B`, `1 BU`, `1 F`, `1 U` forward as names. Split them into `zone_id` plus `code`. Resolve zone names via P7.

### 5.6 Orders

```
orders
  order_no int,                    -- resets daily, human-facing, spoken aloud
  channel enum('POS','WEB','PHONE'),
  type enum('DINE_IN','TAKE_AWAY','DELIVERY'),
  table_id, table_session_id, customer_id, waiter_id, terminal_id,
  guest_count int,
  status enum('DRAFT','PLACED','IN_KITCHEN','READY','SERVED',
              'CHECK_PRINTED','FINALIZED','VOIDED'),
  note, client_order_uuid uuid unique,
  business_date date,
  service_started_at timestamptz,  -- drives rate resolution, §6.7
  sent_to_kitchen_at timestamptz

order_lines
  order_id, menu_item_id, variant_id,
  name_snapshot, name_ur_snapshot,
  qty numeric(10,3), unit_price bigint, line_discount bigint,
  tax_class_id, station_id, seat_no, note, void_reason,
  hs_code_snapshot, uom_snapshot, sale_type_snapshot,
  kitchen_status enum('HELD','PENDING','COOKING','READY','SERVED','VOIDED'),
  course int, sent_at, started_at, ready_at, served_at, bumped_by

order_line_modifiers
  order_line_id, modifier_id, name_snapshot, name_ur_snapshot, price_delta bigint

kds_events
  order_line_id, station_id, from_status, to_status, actor_id, at, was_recall boolean
```

**`orders` and `order_lines` contain no tax column. Do not add one.** Snapshot `name`, `unit_price`, and the three fiscal codes onto the line at add-time so a later menu edit cannot alter a transmitted invoice.

### 5.7 Checks

A check is the pre-payment document. It is not a tax invoice and never carries a fiscal number.

```
order_checks
  order_id,
  check_no text unique,            -- own sequence, gaps permitted, prefix CHK-
  printed_at, printed_by, terminal_id,
  mode enum('BOTH_RATES','ASSUMED_METHOD'),
  assumed_method enum('CASH','CARD','WALLET','QR'),   -- null when mode = BOTH_RATES
  subtotal bigint, discount_total bigint, taxable_base bigint,
  service_charge bigint, pos_fee bigint,
  estimate jsonb,                  -- one entry per rate shown, §6.4
  is_superseded boolean default false,
  supersedes_id uuid references order_checks(id),
  void_reason, voided_by, voided_at
```

Allocate `check_no` from its own counter. Gaps are acceptable here because a check has no fiscal status. Never allocate `local_no` to a check.

### 5.8 Invoices and payments

```
invoices
  order_id, terminal_id, final_check_id uuid references order_checks(id),
  local_no text unique,            -- gap-free, monotonic, never resets, never reused
  business_date date,
  subtotal bigint, discount_total bigint, taxable_base bigint,
  tax_total bigint, service_charge bigint, pos_fee bigint,
  rounding_adj bigint, grand_total bigint,
  tax_snapshot jsonb,
  status enum('FINALIZED','CREDITED'),
  pra_fiscal_no, pra_status, pra_synced_at,
  fbr_fiscal_no, fbr_status, fbr_synced_at,
  printed_count int, finalized_by, finalized_at

invoice_tax_lines
  invoice_id, tax_class_id, rate_bps int, base bigint, amount bigint,
  payment_method_scope enum('CASH','CARD','WALLET','QR')

payments
  invoice_id, method enum('CASH','CARD','WALLET','QR'),
  amount bigint, tendered bigint, change bigint,
  card_last4, terminal_ref, tax_rate_applied_bps int,
  attempt_status enum('APPROVED','DECLINED'), declined_reason

credit_notes
  invoice_id, reason, amount bigint, issued_by,
  pra_fiscal_no, pra_status, fbr_fiscal_no, fbr_status

invoice_counter                    -- single row, locked FOR UPDATE at finalize
  next_value bigint, prefix text
check_counter
  next_value bigint, prefix text
```

Record declined card attempts in `payments` with `attempt_status = 'DECLINED'`. A decline is the event that changes the tax rate, and it must be visible in the audit trail rather than inferred from a gap.

Allocate `local_no` by locking `invoice_counter` with `SELECT … FOR UPDATE` inside the finalize transaction. Do not use a Postgres sequence — sequences leak numbers on rollback and a fiscal audit asks about gaps.

Set `business_date` explicitly at finalize from `outlet_config.business_day_cutoff`. Do not derive it at read time. Label the column "Business date" in every report and UI surface.

### 5.9 Shifts

```
shifts          opened_by, opened_at, closed_by, closed_at,
                opening_float bigint, expected_cash bigint, counted_cash bigint,
                variance bigint, notes, mode enum('MANUAL','AUTO'), status
cash_movements  shift_id, type enum('PAY_IN','PAY_OUT','DROP'),
                amount bigint, reason, actor_id
```

### 5.10 Tax and settings

```
tax_classes  key, name, description        -- STANDARD_FOOD, EXEMPT, ZERO
tax_rules    tax_class_id, payment_method, rate_bps int,
             effective_from timestamptz, effective_to timestamptz,
             authority, legal_reference text
settings     key unique, value jsonb, updated_by, updated_at
setting_history  key, before jsonb, after jsonb, actor_id, at, reason
```

Seed `tax_rules`:

| Class | Method | rate_bps | effective_from | legal_reference |
|---|---|---|---|---|
| STANDARD_FOOD | CASH | 1600 | 2012-07-01 | PSTSA 2012, standard rate |
| STANDARD_FOOD | CARD | 800 | 2026-07-01 | Punjab Finance Act 2026 |
| STANDARD_FOOD | WALLET | 800 | 2026-07-01 | Punjab Finance Act 2026 |
| STANDARD_FOOD | QR | 800 | 2026-07-01 | Punjab Finance Act 2026 |

Store rates as integer basis points. Never store a float percentage.

### 5.11 Storefront

```
customers     email, phone, name, email_verified_at, marketing_opt_in
otp_codes     email, code_hash, expires_at, consumed_at, attempt_count, ip
web_sessions  customer_id, table_token, cart jsonb, expires_at
qr_tokens     table_id, token unique, is_active, scan_count
```

---

## 6. Invoice Lifecycle and Tax Engine

Engine location: `packages/domain/src/tax/`. Pure TypeScript. No framework imports.

### 6.1 Two documents

The restaurant issues two distinct printed documents per sale. Build both.

| | **Check** | **Tax invoice** |
|---|---|---|
| When | Customer asks for the bill, before payment | After payment is collected |
| Purpose | Show the customer what to pay | Fiscal record |
| Tax shown | Yes, as an estimate | Yes, authoritative |
| Number | `check_no`, e.g. `CHK-000482`, gaps allowed | `local_no`, gap-free |
| Fiscal number | Never | PRA and FBR numbers |
| QR code | Never | Yes, per §7.5 |
| PRA logo | Never | Yes |
| Transmitted | Never | Always |
| Header marking | `NOT A TAX INVOICE` | per PSTSA s.30(1) |
| Reprintable | Yes, logged | Yes, `printed_count` incremented |

### 6.2 The flow

```
order served
  → staff press CHECK
      → validate the order has at least one line
      → compute the estimate with the same engine used at finalize
      → allocate check_no, insert order_checks
      → order.status = CHECK_PRINTED, table.status = CHECK_PRINTED
      → print the check
  → customer pays
      → card declined → record payments row attempt_status DECLINED
      → customer pays cash instead
  → staff record the actual payment method and amount
      → if the actual method differs from what the check assumed, §6.5
  → FINALIZE
      → recompute tax authoritatively from the recorded payments
      → allocate local_no, insert invoice, link final_check_id
      → order.status = FINALIZED, table.status = CLEANING
      → enqueue fiscal_outbox for PRA and FBR
      → attempt inline transmission, 1200 ms timeout
      → print the tax invoice with fiscal numbers, QR, and PRA logo
```

Nothing reaches PRA or FBR before the payment method is known (R10). A card decline changes the rate from 8% to 16%, and transmitting before that is settled would require a credit note to correct.

### 6.3 Calculation order

Reference invoice INV-20260822-11272, reproduced exactly:

```
Line subtotal            12,220.00    Σ(qty × unit_price) + modifier deltas
Order discount                0.00
─────────────────────────────────
Taxable base             12,220.00
Sales tax @ 8% (card)       977.60    base × 800 bps
POS service fee               1.00    fixed, per invoice
Service charge @ 5%         611.00    base × 500 bps, not taxed
─────────────────────────────────
Grand total              13,809.60
```

### 6.4 The check shows both rates

Default `check.mode = 'BOTH_RATES'`. A check printed before the payment method is known cannot state one correct total, and the gap is large: on the reference order the difference between cash and card is Rs. 977.60 on a Rs. 12,220 base.

Printing both rates is the only version that is never wrong, removes the reprint entirely when a card declines, and shows the customer that paying by card is cheaper — which is the outcome the tax structure is designed to produce.

```
            KHIZER TIKKA
     Gondala Wala Road, Gujranwala
        NTN 2076097-3 · PRA <n>
─────────────────────────────────────
              C H E C K
          NOT A TAX INVOICE
   Check No. CHK-000482   Table 17
   22-AUG-2026 14:13      Order #20390
─────────────────────────────────────
  Mutton Tikka - 4 Pcs    4    2,120.00
  Mutton Gola Kabab       3    1,980.00
  Special Mutton Champ    3    4,170.00
  ... 
─────────────────────────────────────
  Subtotal (ex tax)          12,220.00
  Service charge 5%             611.00
  POS service fee                 1.00
─────────────────────────────────────
  PAY BY CARD        sales tax @ 8%
  Sales tax                     977.60
  TOTAL                 Rs.  13,809.60
─────────────────────────────────────
  PAY BY CASH        sales tax @ 16%
  Sales tax                   1,955.20
  TOTAL                 Rs.  14,787.20
─────────────────────────────────────
  A tax invoice with PRA and FBR
  verification will be issued after
  payment.
```

Store one entry per rate shown in `order_checks.estimate`:

```json
[
  { "method": "CARD", "rateBps": 800,  "tax": 97760,  "total": 1380960 },
  { "method": "CASH", "rateBps": 1600, "tax": 195520, "total": 1478720 }
]
```

Set `check.mode = 'ASSUMED_METHOD'` where the operator wants a single figure. Then `check.assumedMethod` selects the rate, the check prints one total, and §6.5 handles the mismatch.

### 6.5 When the actual method differs from the check

Applies only when `check.mode = 'ASSUMED_METHOD'`.

At the payment sheet, if the recorded method differs from `order_checks.assumed_method`, block finalization until the cashier acknowledges a dialog stating both figures:

```
Check showed Rs. 13,809.60 (card, 8% tax)
Payment is CASH — total is now Rs. 14,787.20 (16% tax)
Difference Rs. 977.60
[ Reprint check ]  [ Continue to payment ]
```

Reprinting inserts a new `order_checks` row with `supersedes_id` set and marks the prior row `is_superseded = true`. Never mutate a printed check.

Finalize against the recorded payments, never against the check.

### 6.6 Split payments

Set `splitPaymentTaxPolicy` to `PROPORTIONAL`. Allocate the taxable base across methods in proportion to tendered amounts, compute tax per slice, sum:

```
base 10,000  →  card 6,000 @ 8%  =   480.00
             →  cash 4,000 @ 16% =   640.00
                        tax_total = 1,120.00
```

Persist each slice as its own `invoice_tax_lines` row with `payment_method_scope`.

Lock the payment mix once the invoice is finalized. Changing the method after finalization requires a credit note plus a fresh invoice, never an edit (R5).

### 6.7 Resolve rates by service time

PSTSA 2012 s.13 charges tax at the rate in force when the service was provided. Resolve `tax_rules` against `orders.service_started_at`, not `invoices.finalized_at`. An order opened at 23:50 on 30 June and settled at 00:10 on 1 July across a rate change is taxed at the old rate. Apply the same resolution when computing a check estimate.

### 6.8 Policy

```ts
export interface TaxPolicy {
  serviceChargeBps: number;                 // 500
  serviceChargeTaxable: boolean;            // false — see P4
  serviceChargeAppliesTo: OrderType[];      // ['DINE_IN']
  posFeePaisa: Paisa;                       // 100n
  posFeeTaxable: boolean;                   // false — see P4
  splitPaymentTaxPolicy: 'PROPORTIONAL' | 'HIGHEST_RATE' | 'PRIMARY_METHOD';
  discountBeforeTax: boolean;               // true
  rounding: 'NONE' | 'NEAREST_RUPEE' | 'NEAREST_5_RUPEE';
  roundingDirection: 'HALF_UP' | 'UP' | 'DOWN';
}

export interface CheckPolicy {
  mode: 'BOTH_RATES' | 'ASSUMED_METHOD';    // BOTH_RATES
  assumedMethod: PaymentMethod;             // 'CASH'
  maxReprints: number;                      // 3, then supervisor PIN
  abandonAlertMinutes: number;              // 90
}
```

Expose both under Settings keys `tax.policy` and `check.policy`, permission `settings.tax.write`, audit level HIGH.

### 6.9 Where tax may and may not appear

| Surface | Shows |
|---|---|
| Cart, before check | `Subtotal (ex tax)` and `Print check for full total` |
| **Check** | **Full tax and total, both rates by default** |
| Payment sheet | Authoritative total for the selected method |
| **Tax invoice** | **Authoritative tax, fiscal numbers, QR, PRA logo** |
| POS active-orders tray | `Subtotal (ex tax)` before a check exists; the check total after |
| Floor plan table chip | Same as the tray |
| KDS | No money at all (R14) |
| Storefront | Ex-tax prices with the §13.2 notice |

`orders` still carries no tax column. A check total lives on `order_checks`. An authoritative total lives on `invoices`.

### 6.10 Rounding

Perform all intermediate arithmetic in `bigint` paisa. Round once, per tax line, half-up, when the tax line is materialised. Never round a subtotal and then tax the rounded figure. Write any grand-total rounding to `rounding_adj`.

### 6.11 Fiscal decimal conversion

```ts
export function toFiscalDecimal(p: Paisa): number {
  return Number(p / 100n) + Number(p % 100n) / 100;
}
```

The only function permitted to convert money for transmission. Assert in a golden test that the sum of transmitted item values equals the transmitted total exactly.

### 6.12 Snapshot

Write to `invoices.tax_snapshot` at finalize:

```json
{
  "engineVersion": "1.0.0",
  "resolvedAt": "2026-08-22T14:13:07Z",
  "resolvedAgainst": "service_started_at",
  "rules": [{ "class": "STANDARD_FOOD", "method": "CARD", "rateBps": 800,
              "effectiveFrom": "2026-07-01", "legalRef": "Punjab Finance Act 2026" }],
  "policy": { "serviceChargeBps": 500, "serviceChargeTaxable": false,
              "posFeePaisa": 100, "splitPaymentTaxPolicy": "PROPORTIONAL" }
}
```

### 6.13 Abandoned checks

A check printed with no finalized invoice behind it is the exact pattern of unreported cash sales that PRA enforcement looks for. The system must surface it, not enable it.

- Alert on the POS when a check has been open longer than `check.abandonAlertMinutes`.
- Add an **Abandoned Checks** exception report: every check with no invoice, or voided after printing, with cashier, table, value, and elapsed time.
- Show check-to-invoice conversion rate per shift and per cashier in the Z report.
- Require a reason code and supervisor PIN to void a printed check.

### 6.14 Tests

Write at least 70 golden fixtures in `packages/domain/test/fixtures/`. Cover every payment mix, discount ordering, single-paisa line, 999-quantity line, exempt line alongside standard, mid-service rate change, both check modes, a card decline followed by cash, and a byte-exact reproduction of INV-20260822-11272 at 13,809.60 with its matching both-rates check at 13,809.60 / 14,787.20. Require 100% branch coverage on `packages/domain`.

---

## 7. Fiscal Transmission

### 7.1 Statutory requirements

| Provision | Requirement | Where |
|---|---|---|
| PSTSA s.30(1) | Print on every tax invoice: provider name, address and registration number; recipient name and address; description of services; value exclusive of tax; amount of tax; value inclusive of tax | Tax invoice template |
| PSTSA s.13 | Charge the rate in force when the service was provided | §6.7 |
| PSTSA s.17 | Excess tax collected is payable to Government | §6 engine correctness |
| PSTSA s.31(1) | Keep records in English or Urdu | §15 |
| PSTSA s.32(1) | Retain records six years from the end of the financial year | §17 |
| PSTSA s.32(2) | Grant an officer full access to electronic records | `AUDITOR` role |

Add the PRA registration number to the invoice header. The current receipt prints the NTN only, which does not satisfy s.30(1)(a).

### 7.2 FBR endpoints

| Environment | URL |
|---|---|
| Sandbox | `https://esp.fbr.gov.pk:8244/DigitalInvoicing/v1/PostInvoiceData_v1` |
| Sandbox with SSL cert | `https://gw.fbr.gov.pk/DigitalInvoicing/v1/PostInvoiceData_v1` |
| Sandbox invoice detail | `https://esp.fbr.gov.pk:8244/DigitalInvoicing/v1/GetInvoiceDetails` |
| Production | `https://gw.fbr.gov.pk/pdi/v1/api/DigitalInvoicing/PostInvoiceData_v1` |

Authenticate with `Authorization: Bearer <token>`. Validate TLS certificates. The PRAL sample code disables certificate validation — do not replicate that. If the sandbox chain fails, pin the specific CA.

### 7.3 Payload

```jsonc
{
  "bposid": 0,                                  // from pos_terminals.fbr_pos_id
  "invoiceType": 2,                             // 2 = Sale, 4 = Credit Note
  "invoiceDate": "2026-08-22T14:13:07.123Z",
  "ntN_CNIC": "",                               // see P2
  "buyerSellerName": "Walk-in Customer",
  "destinationAddress": "",
  "saleType": "T1000018",                       // see P1
  "totalSalesTaxApplicable": 977.60,
  "totalRetailPrice": 12220.00,
  "totalDiscount": 0,
  "Items": [{
    "hsCode": "",                               // see P3
    "productCode": "MTK-4PC",
    "productDescription": "Mutton Tikka - 4 Pcs",
    "rate": 530.00,
    "uoM": "U1000087",
    "quantity": 4,
    "valueSalesExcludingST": 2120.00,
    "salesTaxApplicable": 169.60,
    "totalValues": 2289.60,
    "discount": 0
  }]
}
```

Send `invoiceType: 4` for credit notes. This is the refund path.

Send `invoiceDate` as ISO-8601 UTC. The PRAL field table specifies `'YYYY-MM-DD HH:mm:ss:SSS'` while the sample JSON sends ISO-8601. Log the exact string sent and confirm against the first sandbox acceptance.

The PRAL item table is internally inconsistent: field 18 `WH (IT)_2` is typed String but the sample sends `0`; field 20 `WH(IT) Section_2` is typed Decimal, named as a section, marked mandatory, and sent as a string. Default every optional numeric to `0` and every optional string to `""`. Build against observed sandbox behaviour. Snapshot every accepted request and response pair to `packages/fiscal/test/fixtures/`.

### 7.4 Response

```json
{ "statusCode": 200, "errorMessage": "", "result": "900005CLNP5914173522",
  "timestamp": "2023-12-20T16:59:15.48+05:00", "errors": { "$values": [] } }
```

`result` is the FBR invoice number, 13 to 30 digits. Treat `statusCode !== 200` as failure. Classify from `errorMessage` and `errors`, not from the HTTP status.

### 7.5 QR code

Print the FBR invoice number and a QR code on the tax invoice only. Render the QR at **version 2.0 (25×25 modules), 0.70 to 1.00 inch square**. Encode these as constants in the receipt renderer. A QR below 0.7 inch on 80mm thermal paper fails to scan once the ribbon wears.

### 7.6 Code maps

Write `packages/fiscal/src/codes.ts` with the spec version in a header comment.

| Column | Default |
|---|---|
| `fbr_sale_type` | `T1000018` (Services); `T1000045` for exempt lines. Confirm via P1 |
| `fbr_uom_code` | `U1000087` Number for plated dishes; `U1000069` Pieces for piece-count items; `U1000009` Liter for bottled drinks; `U1000063` Kilogram for weight-sold items; `U1000088` Others as fallback |
| `fbr_hs_code` | Single configured fallback until P3 resolves |

### 7.7 Adapter

```ts
export interface FiscalAdapter {
  readonly authority: 'PRA' | 'FBR';
  readonly mode: 'SANDBOX' | 'PRODUCTION';
  transmitInvoice(input: FiscalInvoicePayload): Promise<FiscalResult>;
  transmitCreditNote(input: FiscalCreditNotePayload): Promise<FiscalResult>;
  buildQrPayload(result: FiscalResult): string;
  healthcheck(): Promise<{ ok: boolean; latencyMs: number }>;
}

export type FiscalResult =
  | { ok: true; fiscalNumber: string; raw: unknown; at: Date }
  | { ok: false; kind: 'RETRYABLE' | 'PERMANENT'; code: string; message: string; raw: unknown };
```

Classify timeouts and 5xx as `RETRYABLE`. Classify a rejected NTN, an invalid HS code, and a malformed payload as `PERMANENT`. Escalate every `PERMANENT` failure to the compliance dashboard and Sentry within one retry cycle. Never retry a `PERMANENT` failure.

### 7.8 Outbox

```
fiscal_outbox
  invoice_id, credit_note_id, authority, attempt_count, next_attempt_at,
  status enum('QUEUED','IN_FLIGHT','SUCCEEDED','FAILED_PERMANENT','DEAD'),
  request_body jsonb, last_error_code, last_error_body jsonb,
  lease_owner, lease_expires_at,
  unique (invoice_id, authority)
```

The table accepts an `invoice_id` or a `credit_note_id` and nothing else. A check can never enter the outbox (R10).

Back off at 2s, 8s, 30s, 2m, 10m, 30m, then hourly to a 72-hour ceiling, then set `DEAD` and alert. Acquire a Redis lease before claiming rows so two cron invocations cannot double-transmit. On an ambiguous timeout, resend the identical payload and treat an "already exists" response as success.

Print the tax invoice immediately after finalize. If the inline 1200 ms attempt times out, print with `local_no` and the banner `FISCAL REGISTRATION PENDING`, and make the invoice reprintable with full fiscal detail once the numbers land.

### 7.9 Fiscal relay — build in M00

PRAL spec §5 requires whitelisting a fixed hosting server public IP. Vercel functions egress from a rotating pool and have no whitelistable IP. Build `services/fiscal-relay` and deploy it to a single small instance with a dedicated IPv4 (Hetzner CX11 or a Fly.io machine with a reserved address).

The relay:
- Accepts POST from the app, authenticated by `RELAY_SHARED_SECRET`.
- Holds `FBR_TOKEN` and `PRA_TOKEN`. The Next.js app never holds an authority token.
- Forwards to the authority and returns the raw response unmodified.
- Logs every request and response body with the invoice id.
- Exposes `/health`.

Whitelist that IP with FBR by emailing `helpline@fbr.gov.pk` with NTN, hosting company, public IP, and country.

### 7.10 Compliance dashboard

Display four metrics. Delete the seven-counter layout.

1. Age of the oldest unsynced invoice, per authority. Green under 5 minutes, amber under 1 hour, red beyond.
2. Unsynced count and value, current business day and lifetime, labelled separately.
3. Permanent failures needing action, each showing its reason text.
4. Last successful transmission timestamp, per authority.

Add a fifth panel for **open checks** — count and value of printed checks with no invoice (§6.13).

Run a nightly reconciliation asserting `count(invoices) = count(PRA succeeded) = count(FBR succeeded)` per business date. Email the owner via Resend and raise a Sentry issue on any drift.

---

## 8. Offline

- Ship `apps/pos` as an installable PWA.
- Cache menu, tax rules, tables, stations, and policy in IndexedDB. Refresh on a 60-second heartbeat.
- Create orders against a client-generated `client_order_uuid` and queue them locally.
- Print checks offline. The check estimate uses the same `packages/domain` code as the server. Allocate `check_no` client-side with a terminal prefix to avoid collision.
- Finalize offline. The sale completes; only fiscal transmission is deferred.
- Replay to `POST /api/sync/orders` on reconnect using `client_order_uuid` as the idempotency key. The server recomputes authoritatively and returns the canonical invoice.
- Log any client-server divergence to Sentry as `TAX_DRIFT`.
- Assign `local_no` server-side only. Print `order_no` plus `PROVISIONAL — FISCAL PENDING` on offline tax invoices.

Block offline: refunds, shift close, discounts above the supervisor threshold. Show queue depth and time since last sync in a persistent banner. Show a blocking warning past 200 queued orders or 6 hours offline, but continue accepting orders.

---

## 9. Table Floor Plan

Service mode in `apps/pos` for all staff. Editor mode in admin for `MANAGER` and above.

### 9.1 States

Render every state as fill plus border treatment plus icon plus text label. Never colour alone (R15).

| State | Meaning | Icon | Transition in |
|---|---|---|---|
| `FREE` | Clean, available | none, dashed border | from `CLEANING` on clear |
| `RESERVED` | Booked, not arrived | `CalendarClock` | manual; to `FREE` on no-show timeout |
| `SEATED` | Guests down, nothing ordered | `Users` | on seat |
| `ORDERED` | Order open, food in kitchen | `ChefHat` | on first line sent to kitchen |
| `SERVED` | All lines bumped ready | `UtensilsCrossed` | automatic |
| `CHECK_PRINTED` | Check issued, awaiting payment | `ReceiptText` | on check print |
| `PAYING` | Payment sheet open | `CreditCard` | on payment sheet open |
| `CLEANING` | Needs bussing | `Sparkles` | on finalize |
| `BLOCKED` | Out of service | `Ban` | manual only |

Validate every transition server-side (R4). Write an audit row on every transition (R7).

Flag a table sitting in `CHECK_PRINTED` beyond `check.abandonAlertMinutes` with an overdue treatment on the floor plan. This is the visual half of §6.13.

### 9.2 Table chip

```
┌──────────────┐
│  17      ●●●●│  code (tabular) · occupancy dots (seated / max_seats)
│  ChefHat 3/8 │  state icon · kitchen progress
│  24:10   AK  │  dwell timer · waiter initials
│  Rs. 7,310   │  subtotal ex tax, or the check total once printed
└──────────────┘
```

- Count dwell up from `table_sessions.opened_at`.
- Before a check exists, show `Subtotal (ex tax)`. After, show the check total and label the assumed method, or `13,810 / 14,787` under `BOTH_RATES`.
- Omit the money row entirely for `WAITER`. Do not blur it.
- Express ageing as border weight and a tint ramp. Do not introduce a fourth colour.
- Render merged tables as one outline enclosing the members with a single chip listing member codes.

### 9.3 Canvas

- Render SVG on the logical grid `zones.grid_cols × grid_rows`, scaled to fit. No absolute pixel positions.
- Show zone tabs plus an **All Zones** overview tiling each zone at reduced scale.
- Show a summary bar: free, occupied, cleaning, open checks, covers seated, average dwell, longest-seated table.
- Open a context sheet on tap: Seat guests, Open order, Load order, Print check, Take payment, Transfer, Merge, Split, Mark clean, Block. Filter by state and permission.
- Implement transfer and merge as drag gestures with a confirmation step.
- Push updates over SSE with a 3-second polling backstop.
- Below 640px, render a grouped list view using the identical state vocabulary. Do not attempt a pinched floor plan on a phone.
- Suppress the `PAYING` pulse under `prefers-reduced-motion`. It is the only ambient animation in the product.

### 9.4 Editor

Drag to place, snap to grid, rotate in 45-degree steps, resize `RECT` and `BOOTH`, duplicate, assign zone, set `min_seats` and `max_seats`, upload a zone background to R2 to trace against. Persist `x`, `y`, `width`, `height`, `rotation`. Add an unsaved-changes guard.

---

## 10. Kitchen Display

`apps/kds`. Fullscreen, no browser chrome, token-scoped URL per station.

### 10.1 Tickets

Create one ticket per order per station. A station sees only its own lines.

Each ticket shows: order number at large size, table code and zone, channel badge (`DINE-IN`, `WEB`, `TAKE-AWAY`), course number, elapsed timer, and the lines.

Render each line as quantity first, legible from two metres: `3× Mutton Gandheri — 4 Pcs`.

**Render modifiers and notes at full size in a contrasting treatment.** This is the highest-value data on the screen and it is entirely absent from the current system.

### 10.2 No money on the KDS

Do not render a price, subtotal, or total on any KDS surface (R14).

### 10.3 Timers

Count up from `order_lines.sent_at`. Never render a negative duration (R13).

```
elapsed < target_prep_seconds   → OK
elapsed < warn_seconds          → WARN     amber + icon
elapsed ≥ overdue_seconds       → OVERDUE  red + icon
```

Format as `mm:ss` to 59:59, then `1h 04m`. Past overdue, label as `12:40 over`. Read thresholds per station from `stations`.

Sort tickets by `sent_at` ascending, always. Highlight overdue tickets. Do not reorder them — a cook's spatial memory of the rail must hold.

### 10.4 Bump

Tap a line to advance `PENDING → COOKING → READY`. Tap the header to bump all. Write a `kds_events` row on every transition. Implement **recall**: restore the last bumped ticket for 90 seconds with `was_recall = true`.

### 10.5 All-day rail

Show aggregate outstanding quantity per item across all open tickets for that station:

```
ALL DAY · TANDOOR    Roti Per Head 14    Roghni Nan 3
```

### 10.6 Course firing

Set `kitchen_status = 'HELD'` for lines above the current course. Fire a course from the POS. If P11 determines the kitchen does not run courses, ship the schema and hide the UI behind `kds.coursesEnabled = false`.

### 10.7 Operational

- Play an audio cue on a new ticket. Per-station volume, mutable.
- Cache tickets and queue bumps in IndexedDB. Reconcile against a full fetch on reconnect.
- Nudge the layout subtly every 60 seconds on idle to mitigate screen burn.
- Render line names bilingually per §15.

---

## 11. POS Active-Orders Tray

Same data as the KDS, different job. The KDS answers what to cook next; the tray answers which order to add to, check, or settle.

### 11.1 Entry

- A persistent `Active Orders` button in the POS header, badged with the open-order count.
- Tapping an `ORDERED` or `CHECK_PRINTED` table on the floor plan.
- `/` focuses search. Typing digits jumps to that table.

### 11.2 Layout

- Render channels as chips, not tiles: `All 4 · Dine-in 4 · Takeaway 0 · Web 0`. Never let an empty channel consume a third of the viewport.
- Add a state filter: `In kitchen · Served · Check printed`.
- Sort by oldest first (default), by table, or by value.
- Filter by zone, waiter, or overdue kitchen state.
- Offer a comfortable/compact density toggle, persisted per user.
- Use responsive columns. Do not use a fixed three-column grid.
- Derive header count and sum from the same query as the cards (R16).

### 11.3 Card

Before a check is printed:

```
TABLE 17 · Ground                    DINE-IN        24:10 ⚠
Walk-in Customer · 4 guests · Waiter AK
7 items · kitchen 3/8 ready   ▓▓▓░░░░░
4× Chicken Kabab · 5× Mutton Boneless Tikka · 3× Roti Per Head  +4 more
──────────────────────────────────────────────────
Subtotal (ex tax)                          Rs. 7,310.00
[ LOAD ORDER ]   [ PRINT CHECK ]   [ ⋯ ]
```

After a check is printed:

```
TABLE 17 · Ground        DINE-IN   CHECK CHK-000482   08:41 since check
...
Check total     card Rs. 8,846.10  ·  cash Rs. 9,430.90
[ TAKE PAYMENT ]   [ Reprint check ]   [ ⋯ ]
```

Place Transfer, Merge, Split, Void order, and Void check in the `⋯` overflow. Require confirmation, a reason code, and a supervisor PIN for either void. Do not place a destructive action adjacent to the primary action.

---

## 12. Printing

Build all three paths. Make the active path selectable per terminal in Settings.

1. **Print bridge agent — primary.** A signed Node binary on the till exposing `http://localhost:9110`, accepting an ESC/POS byte buffer. It owns the printer queue, paper-out handling, retry, and offline ticket buffering. It also hosts the Urdu raster pipeline (§15.3).
2. **WebUSB / WebSerial — fallback.** Chrome only, gesture-gated.
3. **80mm HTML plus browser print dialog — universal fallback.**

Build three templates: kitchen ticket, **check**, and **tax invoice**. The check and the tax invoice must be visually distinct at a glance — a customer must never mistake a check for a fiscal receipt, and neither must an inspector (R17).

---

## 13. Storefront

### 13.1 Routes

```
/                          Landing, SSG
/menu                      Full menu, ISR 300s
/menu/[category]/[slug]    Item detail
/t/[token]                 QR entry, resolves table, opens ordering sheet
/order/[publicId]          Live order status
```

### 13.2 Pricing display

Display ex-tax prices. Show this notice on the menu and in the cart:

> Prices exclude sales tax. Tax is added at payment: 16% on cash, 8% on card and digital payments.

Do not display a tax-inclusive price on the storefront. The payment method is unknown until the counter.

### 13.3 Email OTP

```
enter email → POST /api/otp/send → Resend delivers a 6-digit code
  → store bcrypt(code + OTP_PEPPER), 10-minute TTL, single use
  → POST /api/otp/verify → set a signed httpOnly 90-day session cookie
  → returning customers skip OTP until the cookie expires
```

Rate limit: 3 sends per email per hour, 5 per IP per hour, 5 verify attempts per code then burn it. Never log a code. Invalidate on successful verify.

Send OTP from a dedicated subdomain configured in `RESEND_FROM_OTP`, with SPF, DKIM, and DMARC. Keep it separate from `RESEND_FROM_TRANSACTIONAL` so a marketing complaint cannot delay a login code. Configure Resend webhooks and surface bounce and complaint events in admin.

Make the cookie duration a setting under `storefront.sessionDays`.

### 13.4 Web order lifecycle

```
scan QR → /t/[token] → menu → cart → email OTP → PLACE
  → order created with channel WEB, status PLACED, table bound from the token
  → Redis publish → POS tray badge and audible chime
  → staff ACCEPT or reject with a reason
  → on accept, the order fires to KDS carrying a WEB badge
  → customer watches /order/[publicId]
  → check printed at the table, payment at the counter, finalize
```

Never auto-accept a web order.

### 13.5 SEO

- Emit `generateMetadata` per route with canonicals and `next/og` images from item photos.
- Emit JSON-LD: `Restaurant`, `Menu`, `MenuSection`, `MenuItem` with `offers`, and `LocalBusiness` with `openingHoursSpecification` and `geo`, all fed from `outlet_config`.
- Server-render the menu as HTML with real prices. Do not fetch the menu client-side.
- Generate `sitemap.ts` and `robots.ts` from live categories and items.
- Serve R2 images through a resizing Worker as AVIF or WebP with explicit dimensions. Set `priority` on the first viewport row only. Self-host fonts with `next/font`.
- Ship no POS bundle code in the storefront.

---

## 14. RBAC and White Label

### 14.1 Roles

| Role | Capability |
|---|---|
| `OWNER` | Everything, including tax policy, fiscal credentials, user management |
| `MANAGER` | Menu, tables, stations, discounts, refunds, void checks, shift close, all reports |
| `CASHIER` | Orders, print check, take payment, finalize, pre-check void, own shift |
| `WAITER` | Orders, send to kitchen, print check. No payment. No finalize |
| `KITCHEN` | KDS only, token-scoped |
| `AUDITOR` | Read-only reports, tax exports, compliance dashboard, s.32(2) access pack |

Key permissions as strings (`check.print`, `invoice.finalize`, `invoice.refund`, `settings.tax.write`). Check server-side on every action. Client-side hiding is cosmetic.

### 14.2 Terminal and PIN

Bind a terminal for the shift with email and password. Identify individual staff with a 4 to 6 digit PIN per till action. Re-lock on a configurable idle timeout. Require TOTP for `OWNER` and `MANAGER`. Require password re-entry to open the fiscal credentials screen regardless of session age.

### 14.3 Brand config

```ts
export const BrandConfigSchema = z.object({
  identity: z.object({
    tradingName: z.string(), legalName: z.string(), tagline: z.string().optional(),
    logoLight: z.string(), logoDark: z.string(),
    logoReceipt: z.string(),          // 1-bit monochrome, max 384px wide
    favicon: z.string(),
  }),
  theme: z.object({
    primary: z.string(), surface: z.string(), accent: z.string(), danger: z.string(),
    radius: z.enum(['sharp','soft','round']), mode: z.enum(['light','dark','system']),
  }),
  typography: z.object({ display: z.string(), body: z.string(), mono: z.string(), urdu: z.string() }),
  locale: z.object({
    default: z.enum(['en','ur']), enabled: z.array(z.enum(['en','ur'])),
    currency: z.literal('PKR'), timezone: z.string(),
  }),
  receipt: z.object({
    widthMm: z.union([z.literal(58), z.literal(80)]),
    headerLines: z.array(z.string()), footerLines: z.array(z.string()),
    checkFooterLines: z.array(z.string()),
    showQr: z.boolean(), showUrdu: z.boolean(),
  }),
});
```

Resolve theme values at runtime from the database into CSS custom properties injected in the root layout, over the Tailwind v4 `@theme` defaults. A rebrand requires no rebuild.

### 14.4 Receipt footer

Render operator-configured footer lines, then this non-removable line beneath them on both the check and the tax invoice:

```
Powered by NA Technologies Ltd
```

Remove `SOFTWARE DEVELOPED BY CHAUDHARY ALI 0307-7810817`.

### 14.5 Brand grep gate

Fail CI on any occurrence in source of a trading name, NTN, STRN, phone number, street address, or brand hex code. Exclude `packages/db/seeds/`.

### 14.6 Provisioning

Write `pnpm brand:init` to scaffold `.env`, create a Neon branch, run migrations, seed roles and an owner account, populate `outlet_config` from prompts, and write `brand.json` to the `branding` settings key.

---

## 15. Urdu

### 15.1 Scope

| Surface | Treatment |
|---|---|
| Storefront | Full localisation with `next-intl`, `dir="rtl"`, logical CSS properties |
| Check and tax invoice | Bilingual, toggled by `receipt.showUrdu` |
| Menu data | `name_ur` and `description_ur` on items, categories, variants, modifiers |
| KDS | Bilingual line names |
| POS terminal and admin | English only |

PSTSA s.31(1) permits records in English or Urdu, so this split creates no compliance issue.

### 15.2 Typography

Load **Noto Nastaliq Urdu** via `next/font/google` with `display: swap` and subsetting, unless P9 returns a different face.

- Set line-height to 2.0 for Nastaliq. Latin leading clips descenders.
- Never uppercase, letter-space, or condense Urdu text.
- Set body Urdu at 18px minimum.
- Use Western digits for all money, including in Urdu context.

### 15.3 Receipt rasterization

ESC/POS text mode cannot render Nastaliq. Rasterize.

```
receipt model
  → English lines → ESC/POS text commands
  → Urdu lines    → server-side render to 1-bit PNG at printer DPI
                  → GS v 0 raster block
  → interleave into one buffer → print bridge agent
```

- Render server-side with satori plus resvg. Do not rasterize in the browser — font loading races produce blank receipts.
- Set width to 384 dots.
- Cache rendered bitmaps in Redis by content hash.
- Use a 1-bit threshold with no anti-aliasing. Do not dither.
- Route `logoReceipt` through the same pipeline.

---

## 16. Realtime

Publish mutations to an Upstash Redis channel. Subscribe from a Node-runtime SSE route handler. Poll every 3 seconds as a correctness backstop on every consumer. Reconcile against a full fetch on every reconnect.

Do not use Neon `LISTEN/NOTIFY` — it does not survive serverless pooling. Do not attempt WebSockets on Vercel.

---

## 17. Reporting and Retention

Build: shift X and Z reports, sales by date, item sales, category mix, channel mix, payment-method mix, tax liability by rate, **Floor Performance** (table turns, dwell by zone and daypart, covers per waiter, revenue per seat-hour, dead-table time), and exception reports (voids, discounts, price overrides, check reprints, **abandoned checks**, declined card attempts).

Include check-to-invoice conversion rate per shift and per cashier in the Z report.

Build two authority-facing reports:
- **PRA return support** — taxable value and tax collected, split by rate, per tax period.
- **Auditor access pack** — a read-only date-ranged export satisfying s.32(2).

Generate every export server-side behind a permission check.

Never purge invoices, invoice lines, payments, checks, tax snapshots, credit notes, or audit rows within six years of the end of the financial year (s.32(1)).

---

## 18. Milestones

One milestone per session. Write `docs/runfiles/M<nn>-<slug>.md` first. Do not proceed past a failing gate.

### Phase 0 — Foundation

**M00 · foundation**
Scaffold §3. Strict TypeScript, ESLint with the R1, R2, R10, R12, R13, R17 rules, Prettier, Husky, lint-staged. Tailwind v4 tokens. CI: typecheck, lint, test, migration-diff, brand-grep, mock-data-grep. Vercel projects and Sentry. `.env.example` per §4. Build and deploy `services/fiscal-relay` with a dedicated IPv4. Send P1, P2, P3, P5, P6.
*Gate:* `turbo build` green. A float-money violation fails lint. A hardcoded client name fails brand-grep. Relay `/health` responds from its fixed IP.

**M01 · design-system**
Tokens light and dark, runtime-overridable. Type scale. Urdu face wired. Components: `Money`, `DataTable`, `Sheet`, `Dialog`, `NumericKeypad`, `StatusPill`, `Duration`, toast, empty, error, loading, offline. `/_ds` route showing every primitive in every state with light/dark and LTR/RTL toggles.
*Gate:* no hardcoded hex in source. RTL toggle produces no layout breakage. `Duration` cannot render a negative value.

**M02 · schema**
Implement §5 in full including `order_checks`, `check_counter`, `stations`, `zones`, `tables`, `table_sessions`, `kds_events`. Forward-only migrations. `dbRead`/`dbWrite`, immutability trigger, soft-delete mixin, `withAudit`, `withIdempotency`, both counters. Seed stations, tax rules, and the Khizer menu collapsed into items plus variants.
*Gate:* migration applies clean to an empty Neon branch. The immutability trigger rejects an `UPDATE` on a finalized invoice. No tax column exists outside `order_checks`, `invoices`, and `invoice_tax_lines`.

**M03 · domain**
Tax engine, check estimator, pricing, rounding, split allocation, `toFiscalDecimal`, service-time rate resolution, order and table and kitchen state machines. Pure.
*Gate:* 70+ golden fixtures pass including byte-exact INV-20260822-11272 at 13,809.60 and its both-rates check at 13,809.60 / 14,787.20. 100% branch coverage on `packages/domain`.

### Phase 1 — Static UI on mock data

**M04 · pos-ui** — order grid, cart, **check preview and print dialog**, payment sheet, method-mismatch dialog, table picker, split-payment UI, discount modal, floor plan service mode, active-orders tray in both card states, web-order inbox, offline banner.
**M05 · admin-ui** — menu manager, modifier builder, floor plan editor, stations manager, staff, settings registry renderer, branding editor, compliance dashboard including the open-checks panel, all report screens.
**M06 · kds-storefront-ui** — KDS per-station ticket rail, all-day rail, course lanes; storefront menu in both languages, cart sheet, OTP screens, order status.
*Phase gate:* every screen navigable on mock data. UI review signed off. **Data contracts frozen.**

### Phase 2 — Wiring

**M07 · auth** — Auth.js v5, PIN layer, permissions, TOTP, terminal binding.
**M08 · menu-floor-brand** — R2 presigned uploads, image pipeline, variants, modifiers, drag-reorder, floor plan geometry persistence, zone backgrounds, station CRUD, live theme editing.
**M09a · orders-kitchen** — order lifecycle, station routing, KDS live over SSE, bump and recall, all-day aggregation, course firing.
**M09b · floor-live** — table sessions, live floor plan states, seat, transfer, merge, split, mark clean, active-orders tray wired.
**M10 · check-and-payment** — check estimator wired, `check_no` allocation, check template and print, reprint and supersede, declined-payment recording, method-mismatch dialog, split payments, finalize transaction, `local_no` allocation, tax invoice template, all three print paths, abandoned-check alerting.
**M11 · fiscal** — FBR adapter against sandbox, PRA adapter, relay integrated, outbox, retry, credit notes, QR at spec dimensions, reconciliation cron, compliance dashboard live.
**M12 · shifts** — open and close, auto-schedule, pay-in, pay-out, drop, variance, X and Z reports via Resend, check-to-invoice conversion.
**M13 · reporting** — every report in §17, server-side Excel, PDF, CSV, auditor access pack.
**M14 · storefront** — QR tokens, email OTP, session cart, place, accept, reject, live status, SEO and Core Web Vitals pass.
**M15 · urdu** — `next-intl`, RTL audit, bilingual menu data, receipt rasterization for both documents, bitmap caching.
**M16 · offline** — service worker, IndexedDB queue, offline check printing, replay endpoint, drift detection, offline UI limits.

### Phase 3 — Hardening

**M17 · compliance-rehearsal** — 500-invoice sandbox soak against both authorities, injected outages, credit-note round-trip, card-decline-to-cash path, verified zero loss and correct backlog reporting.
**M18 · performance-a11y** — Lighthouse 95+ on storefront, POS interaction under 100ms on a four-year-old Android tablet, keyboard-complete POS flow, axe clean in both text directions.
**M19 · pilot** — seven-day parallel run. Daily totals must tie to the paisa before cutover.

---

## 19. Definition of Done

- [ ] TypeScript strict, zero `any`, zero non-null assertions in `domain`, `db`, `fiscal`
- [ ] All money is `Paisa` bigint. Only `toFiscalDecimal` converts
- [ ] All writes on `dbWrite`. Multi-row mutations idempotent
- [ ] Audit row on every mutation
- [ ] No tax column on `orders` or `order_lines`
- [ ] Nothing but a finalized invoice or credit note can enter `fiscal_outbox`
- [ ] Every check prints `NOT A TAX INVOICE` and carries no QR, fiscal number, or PRA logo
- [ ] No monetary value on any KDS surface
- [ ] No negative duration rendered anywhere
- [ ] Every state carries icon plus text label, not colour alone
- [ ] Header counts and sums derive from the same query as their list
- [ ] Loading, empty, error, and offline states implemented
- [ ] Tablet 768px and desktop verified. RTL verified where localised
- [ ] Keyboard navigable, axe clean
- [ ] Unit tests on domain logic, integration test on the primary flow
- [ ] Brand grep passes
- [ ] Mock-data grep passes

---

## 20. Pre-Flight Tasks

Each task has a default that unblocks the build. Start P1, P2, P3, P5, P6 during M00.

| # | Task | Blocks | Default until resolved | Owner | Lives at |
|---|---|---|---|---|---|
| P1 | Confirm `saleType` for a restaurant service line | M11 | `T1000018` | Najam → helpline@fbr.gov.pk | `packages/fiscal/src/codes.ts` |
| P2 | Confirm `ntN_CNIC` for a B2C walk-in. The field is mandatory and a walk-in has neither | M11 | `"0000000"` | Najam → helpline@fbr.gov.pk | `packages/fiscal/src/codes.ts` |
| P3 | Confirm `hsCode` where no goods HS code applies. Annexure 10.4 is a customs tariff list with no entry for a restaurant meal | M11 | `"21069090"` | Najam → helpline@fbr.gov.pk | settings `fiscal.fbr.defaultHsCode` |
| P4 | Written advisor confirmation on service-charge and POS-fee taxability under PSTSA s.7(1) | Go-live | `serviceChargeTaxable: false`, `posFeeTaxable: false` | Restaurant's tax advisor | `setting_history` + `docs/decisions/` |
| P5 | Obtain the PRA eIMS/RIMS technical specification | M11 | PRA adapter stubbed, returns `RETRYABLE` | Najam → PRA | `packages/fiscal/src/pra/` |
| P6 | Confirm whether PRA requires software approval under s.31(4) | Go-live | Assume required, apply early | Najam → PRA | `docs/decisions/` |
| P7 | Decode zone names behind `B`, `BU`, `F`, `U` | M02 seed | `Bala`, `Bala Upstairs`, `Front`, `Upstairs` | Restaurant | `packages/db/seeds/zones.ts` |
| P8 | Confirm real table capacities. Every table is currently seats 4 | M02 seed | `min_seats 2, max_seats 4` | Restaurant | `packages/db/seeds/tables.ts` |
| P9 | Confirm the Urdu face. Jameel Noori Nastaleeq is not open-licensed and needs a commercial licence check | M01 | Noto Nastaliq Urdu | Najam | `packages/config/fonts.ts` |
| P10 | Confirm the five-station map against the physical kitchen | M02 seed | §5.4 table | Restaurant | `packages/db/seeds/stations.ts` |
| P11 | Confirm whether the kitchen fires courses | M09a | `kds.coursesEnabled = false` | Restaurant | settings |
| P12 | Confirm whether either authority mandates a vendor string beyond "Powered by NA Technologies Ltd" | Go-live | §14.4 line | Najam | `receipt.footerLines` |
| P13 | Confirm the check mode the restaurant wants | M10 | `BOTH_RATES` | Restaurant | settings `check.policy` |
| P14 | Confirm whether PRA restricts the wording or format of a pre-payment check | Go-live | `NOT A TAX INVOICE` per §6.4 | Najam → PRA | Check template |

---

## 21. Defects That Must Not Recur

Every row is a requirement, derived from the current production system.

| # | Defect | Prevented by |
|---|---|---|
| C1 | Empty cart shows `Grand Total Rs. 1` with finalize enabled | Check print and finalize both reject an order with zero lines |
| C2 | `Rs. NaN` on Recent Orders | R1 |
| C3 | `Total Revenue Rs. 0` beside `Total Orders 19984` | R16 |
| C4 | Popular Items lists dishes not on this menu | mock-data grep gate |
| C5 | Cart labels `Tax (16%)` regardless of method | §6.9 — the cart shows no tax; the check states the rate against each method explicitly |
| C6 | `INV-20260821-11266` displayed at `22 Aug, 01:29` | §5.8 explicit `business_date`, labelled in UI |
| C7 | Two unrelated identifiers per sale | §5.8 — `order_no`, `check_no`, `local_no`, each with a stated purpose |
| C8 | 13,866 invoices against 20 synced, 0 pending, 0 failed | §7.10 |
| K1 | Personal mobile number as software vendor on every fiscal receipt | §14.4 |
| K2 | Only `VOID` exists, no credit note | §7.3 `invoiceType: 4` |
| K3 | No age-of-oldest-unsynced metric | §7.10 metric 1 |
| K5 | No PRA registration number on the receipt | §7.1 |
| V1 | Header says 4 orders and Rs. 40,623.70; three cards render summing Rs. 34,161.30 | R16 |
| V2 | `-08:20` rendered in red | R13, §10.3 |
| V3 | Timer colours not ordered by urgency | §10.3 thresholds |
| V4 | Delete icon adjacent to `LOAD ORDER` | §11.3 overflow plus PIN |
| V5 | No item state, modifiers, notes, course, or station split on kitchen cards | §10.1 |
| V6 | Empty channel tiles consume two thirds of the header | §11.2 chips |
| V7 | Kitchen queue searchable "by amount" | §11.1 |
| V8 | Fixed three-up grid, no sort or filter | §11.2 |
| V9 | `TABLE 16 B` zone-naming hack | §5.5 zones |
| — | Kitchen cards priced tax-inclusive at 16% before the method is known | R14 on KDS; §6.9 elsewhere |
| — | Menu grid renders placeholder images and the literal text `Spe` | §5.3 image pipeline, M08 |
| — | Category strip overflows, hiding categories 4 to 13 | §5.3 variant collapse |
| — | Card titles truncate mid-word | M01 component spec |
| — | Every table capacity 4, no floor plan | §5.5, §9, P8 |
| — | No fast cashier switching on a shared till | §14.2 PIN |
| — | No mid-shift cash drop or pay-out | §5.9 `cash_movements` |
| — | No record of a declined card attempt | §5.8 `payments.attempt_status` |
| — | No visibility of checks printed but never finalized | §6.13 |

---

## Appendix A — Golden Fixtures

### A.1 Tax invoice INV-20260822-11272

Any change to `packages/domain` altering this output is a breaking change.

```
Table 17 · DINE_IN · CARD · Walk-in Customer · 22-AUG-2026 14:13

Mutton Tikka - 4 Pcs            4 ×   530.00 =  2,120.00
Mutton Gola Kabab - 5 Pcs       3 ×   660.00 =  1,980.00
Special Mutton Champ            3 × 1,390.00 =  4,170.00
Special Mutton Mix Olive Half   1 × 3,020.00 =  3,020.00
Roti Per Head                   3 ×    80.00 =    240.00
Half Bowl                       1 ×   260.00 =    260.00
Fresh Salad                     1 ×   270.00 =    270.00
Mineral Water 1.5 Litre         1 ×   160.00 =    160.00
──────────────────────────────────────────────────────────
Total (ex tax)                                 12,220.00
Sales tax @ 8% (card)                             977.60
POS service fee                                     1.00
Service charge @ 5% (untaxed)                     611.00
──────────────────────────────────────────────────────────
TOTAL                                     Rs.  13,809.60
```

Expected `invoice_tax_lines`: one row — `STANDARD_FOOD`, `rate_bps 800`, `base 1222000`, `amount 97760`, `payment_method_scope CARD`.

### A.2 The matching check, mode `BOTH_RATES`

```
Subtotal (ex tax)   12,220.00
Service charge 5%      611.00
POS service fee          1.00
PAY BY CARD  8%   tax   977.60   TOTAL  13,809.60
PAY BY CASH 16%   tax 1,955.20   TOTAL  14,787.20
```

Expected `order_checks.estimate`:

```json
[
  { "method": "CARD", "rateBps": 800,  "tax": 97760,  "total": 1380960 },
  { "method": "CASH", "rateBps": 1600, "tax": 195520, "total": 1478720 }
]
```

### A.3 Card decline then cash

Given the A.2 check, a declined card attempt, and full settlement in cash: the invoice must total 14,787.20 with `rate_bps 1600`, `payments` must contain one `DECLINED` row and one `APPROVED` cash row, and `invoices.final_check_id` must reference the A.2 check.

## Appendix B — Statutory References

| Provision | Subject | Used in |
|---|---|---|
| PSTSA 2012 s.7(1) + Explanation | Value of a taxable service; charges by whatever name called; ancillary facilities | P4 |
| s.7(6) | PRA may substitute open market price where value is understated | P4 |
| s.13 | Rate in force when the service was provided | §6.7 |
| s.17 | Excess tax collected is payable to Government | §6 |
| s.30(1) | Mandatory tax-invoice particulars | §7.1 |
| s.30(2)–(3) | Prescribed format; mandatory electronic transmission | §7 |
| s.31(1) | Records in English or Urdu | §15.1 |
| s.31(3)–(4) | Approved fiscal cash registers; approved software | P6 |
| s.32(1) | Six-year retention from end of financial year | §17 |
| s.32(2) | Officer access to electronic records | §17 |
| PRAL DI Technical Specification v1.2 | Endpoints, payload, codes, whitelisting | §7.2–7.9 |
