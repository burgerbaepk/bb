# M25 · back-office assistant

**Milestone:** M25 · **Phase:** 3 — Hardening
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §14.1, §17, §2 R1/R7/R16
**Deviation:** [ADR 0031](../decisions/0031-back-office-assistant.md)
**Preceding gate:** [M24](./M24-demand-catalogue.md) — PASS

---

## 1. Purpose

The owner asked for a personal assistant on every back-office screen, for the
owner and the manager. It answers business questions by reading the existing
§17 reports, and changes nothing.

## 2. Scope

**In:**

- `apps/pos/lib/assistant/actions.ts` — `askAssistantAction`, eleven read-only
  report tools, the role and permission check.
- `apps/pos/lib/assistant/access.ts` — `canUseAssistant()`, OWNER and MANAGER.
- `apps/pos/lib/assistant/serialise.ts` — `toModelJson()`, paisa to rupees at
  the model boundary.
- `apps/pos/components/admin/AssistantPanel.tsx` — the button and the sheet.
- `AdminShell` and `app/admin/layout.tsx` — render it when the role allows.
- `.env.example` — `ANTHROPIC_API_KEY`, optional.

**Out, and why:**

- **Write tools** (void, refund, 86 an item, raise a demand sheet). Each is an
  R7-audited mutation with a permission and, for some, a supervisor. An
  assistant that can do them needs a confirmation flow and its own ADR.
- **Stored history.** A table is a migration and a retention question (§17).
  Nobody has asked to read yesterday's conversation.
- **Streaming.** The reply arrives whole. Add it if replies feel slow in
  service.
- **The activity log** — ADR 0030 keeps it from the manager.

## 3. Decisions

See ADR 0031. In short: read-only, role-gated, stateless, off without a key.

## 4. Gate

| #   | Assertion                                              | Method                                                                    | Result      |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------- | ----------- |
| 1   | Money reaches the model as rupees, qty as thousandths  | `serialise.test.ts`                                                       | **PASS**    |
| 2   | Only OWNER and MANAGER may use it                      | `serialise.test.ts` for the rule; the action re-checks it server-side     | **PASS**    |
| 3   | No tool writes                                         | Review: every tool calls a `lib/reports`, `expenses`, `demand` read query | **PASS**    |
| 4   | The shell still renders for an auditor, with no button | `test/auth.test.tsx`, `test/admin-navigation.test.tsx`                    | **PASS**    |
| 5   | `pnpm run ci` green                                    | typecheck, lint, tests, four gates                                        | **PASS**    |
| 6   | A real question answered against live data             | Set `ANTHROPIC_API_KEY`, ask the four suggested questions                 | **PENDING** |

## 5. Exit

| Carried forward                   | Owner   | Why                        |
| --------------------------------- | ------- | -------------------------- |
| Gate 6 — live run with a real key | product | No key in this environment |
| Owner told data goes to Anthropic | product | ADR 0031 Consequences      |
