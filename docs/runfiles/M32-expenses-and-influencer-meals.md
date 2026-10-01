# M32 · expenses — category list, and influencer meals from the till

**Milestone:** M32 · **Phase:** 3 — Hardening
**Plan reference:** [ADR 0038](../decisions/0038-influencer-meals.md).
**Preceding gate:** [M31](./M31-attendance-ease.md).

---

## 1. Purpose

The product owner asked for the expense module to be made easy, and for the
category list to stop growing duplicates. Categories were free text, so
"Utilities", "utilities" and "Utilites" were three categories.

They also asked for influencer meals: food given to influencers for
marketing, which is never paid for. It must be recorded, must not be a sale,
and must land as an expense under "Influencers" without a second entry by
hand. The cashier starts it from where "Walk-in Customer" is shown.

## 2. Scope

**In:**

- `apps/pos/components/admin/ExpenseManager.tsx` — category dropdown of the
  categories already used plus "New category…"; amount, category and date
  first; vendor, reference and method folded under "More details"; a blank
  description defaults to the category. Expenses booked from an order show
  "Order #n" in place of Delete.
- `apps/pos/lib/expenses/{queries,actions}.ts` — `readExpenseCategories`;
  `resolveCategory` reuses an existing spelling, case-insensitively, on every
  write.
- `packages/db` — `expenses.order_id`, one live expense per order (partial
  unique index). Migration `0012`.
- `apps/pos/lib/orders/influencer.ts` — `recordInfluencerMealAction`.
- `apps/pos/components/order/CustomerDialog.tsx` — Customer | Influencer.
- `apps/pos/components/order/OrderScreen.tsx` — wiring.

**Out, and why:**

- **A printed influencer slip.** "View bill" already shows what was served
  before the order is closed (ADR 0027 records it).
- **An influencer register** (followers, handles, campaigns). The name is on
  the expense; a register is marketing CRM.
- **Recording one offline.** Same reason as credit (ADR 0036): it needs the
  server to close the order and write the expense together.

## 3. Decisions

See ADR 0038. In short: an influencer meal is a `VOIDED` order with no
invoice, its lines voided with reason `Influencer meal`, and an `expenses`
row in the same transaction at menu value ex tax. `discount.apply`
(manager, owner) is required — giving food away is a 100% discount. The
expense cannot be deleted from the ledger, because that would make the food
disappear from every record.

## 4. Gate

| #   | Assertion                                                    | Method                    | Result   |
| --- | ------------------------------------------------------------ | ------------------------- | -------- |
| 1   | A new category matching an existing one, any case, reuses it | `categories.test.ts`      | **PASS** |
| 2   | Migration `0012` matches the schema                          | `migration-diff` gate     | **PASS** |
| 3   | `pnpm run ci` green                                          | CI (314 POS tests); build | **PASS** |

## 5. Exit

| Carried forward                                                                                                          | Owner       |
| ------------------------------------------------------------------------------------------------------------------------ | ----------- |
| Migration `0012` applied to the pilot database (2026-10-02)                                                              | done        |
| P15 — is an influencer meal a taxable supply?                                                                            | Tax advisor |
| Influencer meal is not exercised end-to-end against a live database in CI (no DB-backed action tests exist for the till) | —           |
