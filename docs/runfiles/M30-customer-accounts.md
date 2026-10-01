# M30 · credit sales and customer accounts

**Milestone:** M30 · **Phase:** 3 — Hardening
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §6, §2 R1/R2/R3/R5/R7/R9
**Deviation:** [ADR 0036](../decisions/0036-customer-credit-accounts.md). Read
it first — it explains how a credit sale is taxed.
**Preceding gate:** [M29](./M29-purchasing.md), same session (see its session
note on §0 rule 1).

---

## 1. Purpose

Let the till finalize an invoice on a customer's account — wholly, or with
some cash now — for customers the owner has agreed to give credit, record
what they pay later, and show what each one owes. Walk-in customers stay
exactly as they are.

## 2. Scope

**In:**

- `packages/db/src/schema.ts` — `customer_accounts`,
  `customer_account_entries`, enum `customer_entry_kind`; migration `0011`.
- `apps/pos/lib/accounts/rules.ts` (+ test), `ledger.ts`, `queries.ts`,
  `actions.ts`.
- `apps/pos/lib/payments/actions.ts` — `finalizeOrderAction` takes an optional
  `account`.
- `apps/pos/components/payment/CreditSaleDialog.tsx`; `Cart` — a **Credit**
  button beside Finalize; `OrderScreen` — the credit path.
- `TaxInvoiceReceipt` and `invoiceEscPosDocument` — "Paid now", "On account",
  signature line.
- `/admin/customers`, `/admin/customers/[id]`, `AccountForm`.

**Out, and why:** see ADR 0036 — allocation and ageing, card on credit sales,
account payments on the till screen, web credit, an assistant tool.

## 3. Decisions

See ADR 0036. In short: an account is opened by the owner on a `customers`
row; a credit sale is an ordinary finalized invoice taxed at the cash rate,
with any cash taken now as a normal payment and the rest as a `CHARGE`; limit
checked under `FOR UPDATE`; balance derived and credited invoices drop out on
read; payments through the till write a `PAY_IN`; no credit offline.

## 4. Gate

| #   | Assertion                                                                    | Method                                                                                                | Result                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Balance exact; limit refused at one paisa over; null limit unlimited         | `accounts/rules.test.ts`                                                                              | **PASS**                                                                                                                                                    |
| 2   | A sale with nothing on credit, or to a closed account, is refused            | `accounts/rules.test.ts`                                                                              | **PASS**                                                                                                                                                    |
| 3   | An ordinary sale is unchanged: paid in full or refused                       | Review: the `taken !== grandTotal` refusal is untouched when `account` is absent; existing tests pass | **PASS**                                                                                                                                                    |
| 4   | Invoice, cash payment, charge, order customer and audit in one transaction   | Review: all inside the finalize `dbWrite` transaction, after `FOR UPDATE` on the account              | **PASS**                                                                                                                                                    |
| 5   | The printed invoice shows the on-account amount and holder                   | `printing/documents.test.ts`                                                                          | **PASS**                                                                                                                                                    |
| 6   | Credit is absent unless offered and disabled offline                         | `test/cart.test.tsx`; `handleFinalize` refuses an account while offline                               | **PASS**                                                                                                                                                    |
| 7   | No frozen contract changed (ADR 0008)                                        | Review: `PaymentMethod`, `Invoice`, report view models untouched                                      | **PASS**                                                                                                                                                    |
| 8   | `pnpm run ci` green; build                                                   | CI (311 POS tests); `pnpm --filter @natech/pos build`                                                 | **PASS**                                                                                                                                                    |
| 9   | A credit sale, a credit note on it, and a till payment on the pilot database | `pnpm db:migrate`, then the till and the screens                                                      | **PARTIAL** — `0011` applied to the pilot database 2026-10-01 and verified (tables, `RETURNED`, the stock `CHECK`); the walk-through on the screens remains |

## 5. Exit

The owner opens an account for a customer by name and mobile number, with an
optional limit and opening balance. At the till, **Credit** lists the open
accounts with what each owes, takes optional cash now, and finalizes; the
invoice prints the holder's name, what was paid and what is on account, with a
signature line. The account's statement lists every credit sale and payment
with a running balance and prints. A manager records payments by any method;
cash into the drawer is on the shift.

### Carried forward

| Item                                 | Owner   | Why                                 |
| ------------------------------------ | ------- | ----------------------------------- |
| Gate 9 — live walk-through           | product | Migration `0011` not yet applied    |
| Account payment from the till screen | later   | ADR 0036 — back office only for now |
