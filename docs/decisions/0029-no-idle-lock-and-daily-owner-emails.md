# 0029 — no idle lock by default, the bill-then-void flag, and the daily owner emails

**Status:** accepted
**Date:** 2026-09-25
**Milestone:** post-M23
**Supersedes:** BUILD-PLAN.md §14.2's five-minute default idle re-lock. The
lock is still available, but it is off unless the owner sets it. Extends
[ADR 0027 (bill print accountability)](0027-bill-print-accountability.md).
There is no schema change and no migration. The new audit actions are strings
in the existing `audit_log`.

## Context

The owner asked for four things:

1. The till should never lock by itself.
2. When a bill is printed and the order is then voided without being
   finalized, that should be flagged in the activity log.
3. The owner should receive a daily email about it.
4. The Daily Sales Report and a summary of the activity log should both be
   emailed to the owner every day, in a professional design with the logo,
   address and a disclaimer.

ADR 0027 already recorded every bill print and bill view. It also reported a
bill that was never finalized. It deliberately left voided orders out of that
report, on the grounds that a void "is somebody's recorded decision and already
reported under `VOID_ORDER`". That left the most direct form of the fraud
unmarked: print the bill, take the cash, void the order. In the exceptions
report this looked exactly like an honest void.

## Decision

**The idle lock.** `security.idleLockSeconds = 0` means the till never
re-locks when idle. Zero is now the default, and the seed writes it. The
server check (`currentTillIdentity`) treats zero as "no idle limit".
`IdleWatcher` keeps refreshing the staff cookie as the till is used even when
the lock is off. Without that refresh, the signed token's 16-hour upper bound
would still lock a busy till once, mid-shift, counted from the morning's PIN.
The seed never overwrites an existing setting, so a deployment already running
with the old five-minute value must change it once, in Settings, to 0. Signing
the terminal out at the end of a shift is unchanged.

**The flag.** `voidOrderAction` checks the order's own audit trail inside the
void transaction. If the bill was printed or shown, it writes a second row,
`ORDER_VOIDED_AFTER_BILL_PRINTED` or `ORDER_VOIDED_AFTER_BILL_VIEWED`. The row
records the figure the customer was quoted, when the bill was produced, and by
whom. A printed bill outranks one only shown on screen, the same ranking the
exceptions report uses. `/admin/activity` shows both actions in red. The same
change fixes an existing mismatch in that screen: it highlighted
`ORDER_LINES_VOIDED`, but the action actually written is `ORDER_LINE_VOIDED`,
so line voids were never highlighted.

**The emails.** Vercel Cron calls `/api/cron/daily-report` every day at 01:30
UTC, which is 06:30 in Pakistan, after the default 05:00 business-day cutoff.
The request carries `CRON_SECRET`. The route reports on the business day that
contained the moment 24 hours earlier. That day has always closed, whatever the
outlet's cutoff and whenever the cron actually runs.

Two emails go to every active OWNER, through the existing `sendOwnerReport`:

- **Daily Sales Report:** gross takings, invoice count, average ticket, net
  sales, tax, delivery and service charges, covers, voids, the payment mix,
  sales by channel, and the ten best sellers.
- **Activity Summary:** orders voided after the bill was printed or shown,
  bills never finalized, every void and discount, and a table of activity per
  staff member.

Every figure comes from a reader that already backs a back-office screen, so
the emails cannot disagree with the POS (R16).

Both emails share one template (`lib/daily/email.ts`), built from pure
functions and unit-tested. It uses nested tables with inline styles, 600px
wide, and includes a plain-text part. The logo, name, address and brand colour
come from `outlet_config` and the branding row at send time (R12). The brand
colour is converted from `oklch()`, which email clients drop, to `rgb()`
(`lib/daily/colour.ts`). The footer carries the legal name, address, contact
details, a confidentiality notice, and a statement that the email is a
management summary, not a tax invoice or a fiscal return.

**Sending once.** The two sends run inside a `withIdempotency` claim keyed on
the business date. A second call for the same day sends nothing. A failed
send, or mail that is not configured, rolls the claim back so the next run can
retry. `?date=YYYY-MM-DD` names a day explicitly, for recovering a missed
send. `sendOwnerReport` now also treats a send that Resend rejects as not sent.
It used to ignore the error that Resend returns, so a rejected Z report looked
delivered.

## Consequences

- A till left unattended stays unlocked. That is the owner's decision, made
  knowing the till never leaves the cashier's sight, and it can be reversed in
  Settings.
- Voiding an order after its bill was printed is no longer quiet. It is marked
  in red at the moment it happens and emailed to the owner the next morning.
- Deployment needs `CRON_SECRET` set in the Vercel project, and
  `NEXT_PUBLIC_POS_URL` so the email can load the logo. Without the URL the
  email uses the trading name as a text logo. It also needs the existing
  `RESEND_API_KEY` and `RESEND_FROM_TRANSACTIONAL`.
- If the second email of the pair fails after the first has sent, the retry
  sends the first one again. That is acceptable for a once-a-day report.
