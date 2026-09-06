# khizer-pos — working notes for Claude

**Product:** standalone restaurant POS, one restaurant per deployment, re-brandable per client.
**Vendor:** NA Technologies Ltd, Glasgow (SC833018).
**Compliance:** Punjab Revenue Authority + FBR Digital Invoicing (PRAL). Pakistan.

## Read this first

[`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md) is the single source of truth — 1357 lines, 21 sections
plus appendices. It supersedes every earlier version. **When this file and the
plan disagree, the plan wins.** Cite it by clause (`§14.2`, `R7`) in code
comments and commit messages; the whole repository is written that way.

Then read the runfile for the last completed milestone in `docs/runfiles/`, and
`docs/decisions/` for the ADRs. In particular, read
[ADR 0018](docs/decisions/0018-remove-kitchen-dependency.md) before trusting
anything §10 ("Kitchen Display"), M06, or M09a say — the kitchen display
product and every kitchen/station dependency in `apps/pos` were removed
outright after those milestones shipped. Likewise, read
[ADR 0019](docs/decisions/0019-remove-check-printed.md) before trusting
anything §6.4/§6.5/§6.8/§6.13 or M10 say about a pre-payment check — the
printed check (`order_checks`, `CHECK_PRINTED`, the reprint chain, the
abandoned-check compliance signal) was removed outright; an order now goes
straight from `SERVED` to the payment sheet, and the tax invoice at finalize
is the first and only printed document. The runfiles are left as written; the
ADRs are what supersede them.

## How work is organised

§0 of the plan sets the rules, and they are not decorative:

1. **One milestone per session. Never combine milestones.**
2. Write `docs/runfiles/M<nn>-<slug>.md` **before** starting the milestone.
3. Do not start a milestone until the previous one's gate passes.
4. **Do not renegotiate a data contract after the Phase 1 freeze** (end of M06).

Every milestone ends with a runfile containing: Purpose, Scope (in **and** out),
Decisions, Gate table with verification method and result, and Exit with a
carried-forward table. Material decisions that deviate from the plan get an ADR
in `docs/decisions/`.

### Progress

| Phase                      | Milestones                                                                                                                                                                                                         | State                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| 0 — Foundation             | M00 foundation, M01 design-system, M02 schema, M03 domain                                                                                                                                                          | complete                       |
| 1 — Static UI on mock data | M04 pos-ui, M05 admin-ui, M06 kds-storefront-ui                                                                                                                                                                    | complete, **contracts frozen** |
| 2 — Wiring                 | M07 auth, M08 menu-floor-brand, M09a orders-kitchen, M09b floor-live, M10 check-and-payment, M11 fiscal, M12 shifts, M13 reporting, M14 storefront, M15 urdu, M16 offline                                          | complete                       |
| 3 — Hardening              | M17 compliance-rehearsal, M18 performance-a11y complete. **M19 pilot: codebase readiness confirmed, seven-day live parallel run not yet started** — see [`docs/runfiles/M19-pilot.md`](docs/runfiles/M19-pilot.md) | in progress                    |

**Post-M19:** the kitchen display product (the KDS half of M06, and M09a in
full) was removed outright — see
[ADR 0018](docs/decisions/0018-remove-kitchen-dependency.md). `apps/kds` no
longer exists. The pre-payment check (the check half of M10) was also removed
outright — see [ADR 0019](docs/decisions/0019-remove-check-printed.md);
`apps/pos/lib/checks/` no longer exists, nor does `order_checks`. The table
above is left as the historical milestone record.

**ADR 0027 reinstated the abandoned-bill compliance signal** that
[ADR 0019](docs/decisions/0019-remove-check-printed.md) removed with the printed
check and recorded as having "no replacement". `View bill` survived that
removal and still produces a document a customer accepts as a demand for
payment, so it now books the order first and writes an `audit_log` row
(`ORDER_BILL_VIEWED`/`ORDER_BILL_PRINTED`); an order quoted and never finalized
is reported as `BILL_NOT_FINALIZED` on the exceptions report. `/admin/activity`
reads the R7 trail, which had no reader before. See
[ADR 0027](docs/decisions/0027-bill-print-accountability.md).

**M23 added demand order sheets** (`/admin/demand`) — see
[ADR 0026](docs/decisions/0026-demand-order-sheets.md) and
[the runfile](docs/runfiles/M23-demand-sheets.md). This is the one thing in the
repository that sits against §1's _Do not build_ list, which names _purchasing_
and _supplier management_. The ADR fixes the boundary and is worth reading
before extending the module: a demand sheet records **what a manager asked
for**, never a fact about the restaurant, so there is no stock level, no
receiving, no supplier table and no recipe link. Each of those is one small
request away, and the ADR exists to be quoted when one arrives.

## The seventeen rules

§2 lists R1–R17 and the mechanism that enforces each. The ones that bite most
often:

- **R1** — money is `bigint` paisa, branded `Paisa`. Format only at the render
  boundary (`Money` in `@natech/ui`). Only `toFiscalDecimal()` converts.
- **R2** — every write through `dbWrite` (Neon WebSocket pool). `dbRead` (HTTP)
  is for RSC reads **only**; it silently no-ops multi-statement transactions, so
  a finalize on it loses the invoice without throwing.
- **R5** — never `UPDATE` a finalized invoice except the fiscal response
  columns. A Postgres trigger enforces it, including against soft delete.
- **R6** — soft-delete everything. Every unique index is partial,
  `WHERE deleted_at IS NULL`.
- **R7** — an audit row for every mutation, written inside the caller's
  transaction (`withAudit`).
- **R9** — authoritative tax is computed once, at finalize, after the payment
  method is known. No tax column outside `invoices`, `invoice_tax_lines`.
  (R9's original wording also covered the printed check's estimate; ADR 0019
  removed the check, so there is no earlier document left to state one.)
- **R11** — strict TypeScript, zero `any`, zero non-null assertions in
  `domain`, `db`, `fiscal`, `auth`.
- **R12** — never hardcode restaurant identity: name, NTN, STRN, address, phone,
  brand hex. It lives in `outlet_config` and in `packages/db/seeds/`.
- **R13** — no negative duration.
  (**R14**, "no monetary value on any KDS surface", is moot since ADR 0018 —
  there is no KDS surface left to enforce it on. **R17**, "every check prints
  `NOT A TAX INVOICE`, no QR, no fiscal number", is moot since ADR 0019 —
  there is no printed check left to mark.)

Four CI gates enforce what a linter cannot: `brand-grep`, `mock-data-grep`,
`tax-column-grep`, `migration-diff`. `pnpm gates` runs them.

## Layout

```
apps/pos          terminal + admin back office. PWA, offline, noindex. port 3000
apps/storefront   public menu + QR self-order. ISR, SEO.                port 3001
packages/auth     hashing, TOTP, permissions, signed tokens, lockout. Node-only
packages/branding white-label config resolution
packages/config   eslint, tsconfig, tailwind preset, fonts
packages/contracts Zod wire shapes + view models. FROZEN (ADR 0008). mocks/ is not
packages/db       Drizzle schema, migrations, clients, seeds
packages/domain   tax, pricing, money, state machines. NO framework imports
packages/fiscal   PRA + FBR adapters, payload builders, QR    (M11)
services/fiscal-relay  fixed-IP egress service, deployed separately (§7.9)
tooling/print-bridge   local ESC/POS agent
```

`packages/domain` imports nothing from Next, React, or Drizzle — the tax engine
must run unchanged inside the POS service worker (§8). ESLint enforces it.

Package scope is `@natech/`, after the vendor, never the client (ADR 0004).

## Stack

pnpm 11.22.0 workspaces + turbo · Node ≥ 22.11 · TypeScript 6.0.3 strict
(`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noPropertyAccessFromIndexSignature`) · Next 16.3.2 · React 19.2.8 ·
Tailwind v4 · Drizzle 0.45.2 on Neon serverless · Zod 4.4.3 ·
next-auth 5.0.0-beta.32 · Vitest 4.1.11 · ESLint 9 flat config.

No Sentry — removed from scope in M00 (ADR 0006). §7.7 escalation is still
unimplemented and M11 owns it.

## Commands

```bash
pnpm run ci        # typecheck + lint + test + the four gates. Run before calling anything done
pnpm build         # turbo build, all apps
pnpm dev           # both apps at once
pnpm format        # prettier write

pnpm db:migrate    # apply committed SQL. NEVER drizzle-kit push (R8)
pnpm db:seed       # reference data; re-runnable, reconciles roles
pnpm auth:owner    # prompts for the first OWNER account (§14.6)
```

Generating a migration: `cd packages/db && ./node_modules/.bin/drizzle-kit generate`,
then commit the SQL **and** the meta snapshot alongside `schema.ts` (R8).

## House style

Comments explain **why**, cite the clause, and name the failure being prevented
— often with the real-world defect from §21 that motivated it. Match the density
of the surrounding file; this repository is deliberately heavily commented and a
terse addition reads as unfinished. Prose is British-English, plain, no
exclamation marks.

Tests assert against the specification, not against the implementation: the tax
engine has 70+ golden fixtures tied to a real invoice, and TOTP is verified
against the published RFC 4226/6238 vectors.

## Traps found the hard way

- **`CI=1` makes pnpm use `--frozen-lockfile`.** After changing any
  `package.json`, install with `pnpm install --no-frozen-lockfile`, or it
  resolves, reports `added 0`, and exits 0 having done nothing.
- **A running `pnpm dev` blocks `pnpm install` on Windows** — the Next dev
  servers hold `lightningcss-win32-x64-msvc.node` open and linking fails with
  `EPERM`. Stop the dev tree before installing.
- **A `_`-prefixed folder under `app/` is a Next private folder** and is not
  routed. `app/api/_thing/route.ts` silently 404s.
- **`.env` lives at the repository root, and Next only reads env from the app
  directory.** `apps/pos/next.config.mjs` loads `../../.env.local` through
  dotenv for exactly this reason. Do the same for any other app that needs it.
- **`db.execute()` returns raw driver values.** An aggregate over a
  `timestamptz` arrives as a **string**, not a `Date`, unlike a mapped select.
  Coerce at the boundary.
- **Drizzle wraps the driver error.** The Postgres message naming the failing
  constraint is on `error.cause`, not `error.message`.
- **A failed statement aborts the whole Postgres transaction.** Wrap each
  expected-failure assertion in its own savepoint.
- **Vitest + jsdom:** importing a `'use server'` module from a client component
  under test pulls in Auth.js and `next/server` and fails to resolve. The POS
  test setup mocks the action modules globally.

## Open pre-flight questions

§20 tracks them. Several block M11: **P1** `saleType` for a restaurant line,
**P2** `ntN_CNIC` for a walk-in, **P3** `hsCode` where no goods code applies,
**P5** the PRA eIMS/RIMS spec, **P6** software approval. Defaults are in place
and documented; none has been confirmed by the authority.
