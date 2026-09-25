# 0031 — a read-only assistant in the back office

**Status:** accepted
**Date:** 2026-09-25
**Milestone:** [M25](../runfiles/M25-assistant.md)
**Touches:** no schema, no migration, no frozen contract ([ADR 0008](0008-phase-1-data-contracts.md)).
Adds one runtime dependency (`@anthropic-ai/sdk`) and one optional environment
variable (`ANTHROPIC_API_KEY`), neither of which §4 lists.

## Context

The owner asked for a personal assistant in the back office, on every screen,
for the owner and the manager.

What an owner or manager asks between services is almost always a reporting
question put in words: how did today go against last Tuesday, what is not
selling, who voided what, what did we spend against what we took. Each answer
already exists — on a §17 report screen, over a date range, behind a filter —
and the friction is finding the right screen and reading it.

## Decision

- A trailing sheet, opened from a button on every `/admin` screen, sends the
  conversation to a server action that calls Claude (`claude-opus-5`) with
  **eleven read-only tools**. Each tool is an existing report query, called as
  its own screen calls it: sales by date, item sales, category, channel and
  payment mix, exceptions, expenses, demand sheets, floor performance, covers
  per waiter, tax liability.
- **No tool writes.** The assistant cannot void, refund, discount, edit the
  menu, change a setting or touch an invoice. R5, R7 and R9 are satisfied by
  having nothing that could breach them. Giving it any write is a new ADR.
- **OWNER and MANAGER only**, by role. AUDITOR holds `reports.read` but is
  excluded: an inspector is owed the records under PSTSA s.32(2), not a model's
  paraphrase of them. The shell hides the button; the action refuses anyway
  (§14.1).
- **No activity-log tool.** ADR 0030 keeps the R7 trail from the manager, and a
  tool that read it would hand it back.
- **Nothing is stored.** The conversation lives in the browser and is sent
  whole each turn, capped at 24 turns. There is no table, so no R6 or R8 work.
- **Money crosses as rupee strings** (`toModelJson`), never raw paisa, so the
  model cannot report takings a hundred times too high.
- **Unset key, no assistant.** Without `ANTHROPIC_API_KEY` the panel says it is
  not configured. The restaurant trades exactly as before.

## Consequences

- **Sales data leaves the deployment.** Aggregated report rows — item names,
  totals, staff display names on the exceptions report — are sent to
  Anthropic's API. No customer phone numbers, no credentials and no fiscal
  tokens are in any tool's output. The owner should know this before setting
  the key.
- **Running cost** is per question, billed to whoever owns the API key.
- **Answers can be wrong.** The system prompt requires every figure to come
  from a tool result, and the report screens stay authoritative (R16). The
  sheet's description says the assistant reads, it does not change anything.
- §1's _Do not build_ list is untouched: nothing here is inventory, purchasing
  or payroll.

## Amendment, 2026-09-25 — three more read tools (M26–M28)

`staff_advances`, `attendance_month` and `stock_on_hand` call the same
queries their screens call (`lib/advances`, `lib/attendance`, `lib/stock`),
so the rule above — one number, whichever surface shows it — still holds. None
writes.

One trap worth recording. `toModelJson` tells money from quantity by field
name: a bigint called `qty…` is thousandths, every other bigint is paisa. A
stock level is a `Qty` called `onHand`, and passed through raw it would reach
the model divided by a hundred instead of a thousand — "0.2 kg of chicken" for
20 kg, stated with confidence. `stock_on_hand` therefore sends quantities as
display strings (`showQty`) and never a bare `Qty`. Any future tool returning a
quantity must do the same, or name the field `qty…`.
