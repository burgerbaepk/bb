# M02 · schema

**Milestone:** M02 · **Phase:** 0 — Foundation
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §5 in full, §2 R2/R3/R5/R6/R7/R8/R9/R10, §7.8
**Status:** complete
**Preceding gate:** [M01](./M01-design-system.md) — passed, G6 partial (visual review is the owner's)

---

## 1. Purpose

Put §5 on disk as reviewed, forward-only SQL, and make the data rules
constraints rather than conventions.

M02 is where the rules stop being lint and start being the database refusing.
A linter guards the code we write; a trigger guards the database against code
nobody has written yet, including a psql session at 2am during an audit.

---

## 2. Scope

**In:** every table in §5 (40 in total) plus `fiscal_outbox` from §7.8; the
machinery — `dbRead`/`dbWrite`, the immutability trigger, the soft-delete
mixin, `withAudit()`, `withIdempotency()`, and both counters; seeds for
stations (P10), tax classes and rules, zones (P7), tables (P8), roles,
categories, and the menu with the §5.3 variant collapse.

**Out:** tax arithmetic (M03 — M02 provides the columns the engine writes
into); auth (M07 — `users` and `roles` exist as tables, nothing authenticates);
any query beyond what a seed needs.

---

## 3. Rules this milestone makes constraints

| Rule | Statement                                                         | Mechanism                                                                                                                                                                 |
| ---- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1   | Money is bigint paisa                                             | Every money column goes through `paisa()`, which pins Drizzle to `mode: 'bigint'`. The default is `'number'`, which returns a float and undoes R1 at the driver boundary. |
| R2   | Writes on `dbWrite`, reads on `dbRead`                            | Two separate exports, not one configurable client.                                                                                                                        |
| R3   | Idempotency key on every multi-row mutation                       | `idempotency_keys` with a unique index, plus `withIdempotency()`.                                                                                                         |
| R5   | Never `UPDATE` a finalized invoice except fiscal response columns | Trigger `invoices_immutable_after_finalize`, plus `invoices_no_hard_delete`.                                                                                              |
| R6   | Soft-delete everything                                            | `deleted_at` everywhere; every unique constraint is a partial index `WHERE deleted_at IS NULL`.                                                                           |
| R7   | Audit row on every mutation                                       | `audit_log` plus `withAudit()`, written inside the caller's transaction.                                                                                                  |
| R8   | Migration SQL committed with the schema change                    | `scripts/migration-diff.mjs`; M02 is the commit that makes it live.                                                                                                       |
| R9   | A check is not a tax invoice                                      | No computed tax value on `orders` or `order_lines`; `scripts/tax-column-grep.mjs` enforces it.                                                                            |
| R10  | Only an invoice or credit note enters the outbox                  | `CHECK (num_nonnulls(invoice_id, credit_note_id) = 1)`.                                                                                                                   |

**R5 and R10 are why this milestone matters.** Both were registered as lint
rules in M00 carrying a `TODO(M02)`. This is where their real enforcement
lands.

---

## 4. Design decisions

**`local_no` comes from a locked counter row, not a sequence.** §5.8 is
explicit about why: a sequence hands out a number and keeps it even when the
transaction rolls back, and a fiscal audit asks about gaps. `invoice_counter`
is one row taken `FOR UPDATE` inside the finalize transaction, so a rollback
returns the number. `check_counter` is the same shape, but gaps there are
acceptable because a check has no fiscal status.

**The R9 distinction the gate sentence does not make.** "No tax column outside
`order_checks`, `invoices`, `invoice_tax_lines`" cannot be read literally,
because §5.3 puts `tax_class_id` on `menu_items` and §5.6 puts one on
`order_lines` — the plan's own schema. A **classification pointer** says which
rate schedule something belongs to and is harmless anywhere. A **computed tax
value** is an answer, and where it is stored decides when it was computed. R9
exists to stop that answer existing before the payment method is known. The
gate script encodes exactly that distinction.

**`business_date` is written explicitly at finalize** (§5.8, defect C6 — an
invoice numbered for 21 August displayed at 22 Aug 01:29).

**No `tenant_id`, no `branch_id`** (§1: the deployment is the tenant boundary).

---

## 5. Gate

From §18 M02: _"migration applies clean to an empty Neon branch. The
immutability trigger rejects an `UPDATE` on a finalized invoice. No tax column
exists outside `order_checks`, `invoices`, and `invoice_tax_lines`."_

| #   | Criterion                                              | Verified by                                 | Result                                                 |
| --- | ------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------ |
| G1  | Migration applies clean to an empty Neon branch        | `db:migrate` on the live branch             | **PASS** — 40 tables, 2 triggers, 5 CHECKs             |
| G2  | The trigger rejects an `UPDATE` on a finalized invoice | integration test                            | **PASS** — money, `local_no`, and snapshot all refused |
| G3  | The trigger still permits the fiscal response columns  | integration test                            | **PASS**                                               |
| G4  | No computed tax value outside the three tables         | `tax-column-grep.mjs`                       | **PASS** — proved by fixture                           |
| G5  | `fiscal_outbox` rejects a row with neither reference   | integration test                            | **PASS**                                               |
| G6  | Soft-delete frees a unique value for reuse             | integration test                            | **PASS**                                               |
| G7  | Counters allocate gap-free                             | integration test                            | **PASS**                                               |
| G8  | Workspace still green                                  | typecheck, lint, test, build, gates, format | **PASS** — 12/12, 4 gates                              |

The branch was confirmed empty before anything ran: PostgreSQL 18.6, zero
tables in `public`. Sixteen integration assertions now run against it.

### Beyond the stated gate

R5 turned out to need more than the sentence asks for. The trigger also refuses
a **soft delete** and a **hard DELETE** of a finalized invoice, because PSTSA
s.32(1) requires six years of retention and an `UPDATE ... SET deleted_at`
would otherwise walk straight past a rule written only about mutation.

---

## 6. Execution log

1. **The two Neon URLs were being parsed wrong before anything else could
   work.** `.env.local` keeps the inline comments from `.env.example`
   (`NEON_DATABASE_URL=... # WebSocket pooled — all writes`), and a hand-rolled
   `split('=')` drags the comment into the URL, where the em dash then fails to
   encode as a header byte. Fixed by using the real dotenv parser, and
   `databaseUrls()` now refuses to start if the two URLs are identical — the
   failure that would otherwise be silent and expensive.

2. **A failed statement aborts the whole transaction in Postgres.** The first
   version of the constraint tests asserted a rejection and then carried on in
   the same transaction, and every later assertion failed with 25P02 for the
   wrong reason. Each expected failure now runs inside a savepoint.

3. **Drizzle wraps the driver error.** `error.message` is `Failed query: ...`;
   the Postgres message naming the trigger sits on `.cause`. Ten assertions
   looked like constraint failures and were actually reading the wrong layer —
   the constraints had been firing correctly the whole time.

4. **The R10 lint rule fired on the test that proves the R10 constraint.** A
   test whose purpose is to write the banned row cannot also obey the rule
   banning it, so the rule is off for test files. The database CHECK is what
   makes the assertion meaningful.

5. **`strictPackage` was overriding the test exemptions.** Each package applies
   it after the shared config, and in flat config later wins, so
   `no-non-null-assertion` was error-level inside tests despite the shared
   config turning it off. It now carries its own `ignores` rather than relying
   on ordering.

6. **R11 forced a better seed.** Rather than exempting `seeds/` from the
   no-non-null-assertion rule, the seeds gained an `inserted()` helper. An
   insert that returns no row now says which insert failed, instead of throwing
   "cannot read id of undefined" somewhere in the middle of seeding.

7. **The seed broke the counter tests, correctly.** They assumed an empty
   `invoice_counter`; once seeded, inserting a second row hit the singleton
   CHECK. Rewritten to exercise `allocateLocalNo()` itself, which is a better
   test than the hand-rolled `SELECT ... FOR UPDATE` it replaced.

### The menu is partial, deliberately

BUILD-PLAN.md documents the category list (§5.4), the variant collapse (§5.3),
and the eight priced lines on the Appendix A.1 reference invoice. It does not
contain the restaurant's full price list.

Items named in the plan without a price are seeded **inactive** at zero rather
than given an invented one. A wrong price is charged to a customer and filed
with PRA; a missing item is noticed the first time someone looks for it.

`outlet_config` is also **not** seeded. Legal name, NTN, STRN, and address are
client identity, and §14.6 populates them from prompts in `pnpm brand:init`.
Putting them in a committed seed is exactly what R12 forbids.

---

## 7. Exit

- [x] All gate criteria pass
- [x] Migration SQL committed alongside `schema.ts` (R8)
- [x] Seed is re-runnable — second run inserts nothing
- [ ] **Next: M03 · domain.** Do not start it in this session (§0 rule 4).

### Carried forward

| Item                                                                      | Milestone      |
| ------------------------------------------------------------------------- | -------------- |
| The restaurant's full price list, to finish the menu seed                 | before go-live |
| P7 zone names, P8 table capacities, P10 station map — all still defaults  | M08            |
| `outlet_config` populated by `pnpm brand:init`                            | M08            |
| `withAudit` and `withIdempotency` are written but not yet called anywhere | M09a, M10      |
| Modifier groups and modifiers have tables but no seed data                | M08            |
