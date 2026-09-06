# M00 · foundation

**Milestone:** M00 · **Phase:** 0 — Foundation
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §3, §4, §18 (M00), §20
**Status:** complete, with gate G7 deferred
**Preceding gate:** none — this is the first milestone

---

## 1. Purpose

Make the §2 non-negotiable rules mechanically enforceable **before** any domain
code exists.

A rule that is not enforced by a machine on the first day is not a rule, it is a
preference. M00 writes no business logic. Its entire output is scaffolding plus
the gates that will reject rule violations for the remaining nineteen milestones.

---

## 2. Scope

**In:** repository initialisation · pnpm workspace and Turborepo ·
`packages/config` (shared tsconfig, ESLint flat config, custom rule plugin,
Tailwind v4 tokens) · three Next.js 16 apps, empty but building · six further
packages, empty but building · `services/fiscal-relay` · `tooling/print-bridge`
stub · CI workflow · Husky, lint-staged, Prettier, Vitest · `.env.example` per §4
· ADRs · pre-flight letter drafts.

**Out:** any database schema (M02) · any tax arithmetic (M03) · any UI beyond a
build-proving placeholder (M01, M04–M06) · deploying anything
([M00-provisioning.md](./M00-provisioning.md)).

**Removed mid-session:** Sentry. See [ADR 0006](../decisions/0006-no-sentry.md).
It leaves §7.7 escalation unimplemented, which M11 must resolve.

---

## 3. Rule enforcement registered by this milestone

| Rule | Statement                                                 | Mechanism                                              | State at exit                           |
| ---- | --------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------- |
| R1   | Money is `bigint` paisa                                   | `natech/no-float-money`                                | **active**                              |
| R2   | `dbRead` banned in mutations                              | flat-config override on `**/actions/**`, `**/route.ts` | **active**                              |
| R8   | Migration SQL ships with every schema change              | `scripts/migration-diff.mjs`                           | **active**, no-ops until M02            |
| R10  | Only an invoice or credit note enters `fiscal_outbox`     | `natech/no-check-in-outbox` + DB CHECK                 | **registered**; DB half M02, wiring M11 |
| R11  | Strict TS, zero `any`, zero `!` in `domain`/`db`/`fiscal` | `@typescript-eslint` + `strictPackage` opt-in          | **active**                              |
| R12  | No hardcoded restaurant identity                          | `scripts/brand-grep.mjs`                               | **active**                              |
| R13  | Never render a negative duration                          | `natech/no-negative-duration`                          | **active**                              |
| R17  | A check carries no fiscal marks                           | `natech/no-fiscal-marks-on-check` + renderer test      | **registered**; test M10                |
| §3   | `packages/domain` imports no framework                    | `domainPurity` opt-in config                           | **active**                              |

R10 and R17 cannot be fully enforced by a linter at M00, because the schema and
the receipt renderer do not exist. Their lint halves are written and registered
now, each carrying a `TODO(M02)` or `TODO(M10)` naming the milestone that
completes it.

---

## 4. Gate

From §18 M00: _"`turbo build` green. A float-money violation fails lint. A
hardcoded client name fails brand-grep. Relay `/health` responds from its fixed
IP."_

| #   | Criterion                                             | Verified by                 | Result                      |
| --- | ----------------------------------------------------- | --------------------------- | --------------------------- |
| G1  | `turbo build` green                                   | `pnpm build`                | **PASS** — 5/5 tasks, 36.8s |
| G2  | Strict typecheck green                                | `pnpm typecheck`            | **PASS** — 12/12            |
| G3  | A float-money violation **fails** lint                | fixture + `eslint`          | **PASS** — see §5           |
| G4  | A hardcoded client name **fails** brand-grep          | fixture + `pnpm brand-grep` | **PASS** — see §5           |
| G5  | Relay `/health` responds                              | live `curl`                 | **PASS** — HTTP 200         |
| G6  | Relay rejects a bad shared secret                     | live `curl`                 | **PASS** — HTTP 401         |
| G7  | Relay `/health` responds **from its fixed public IP** | Fly/Hetzner deploy          | **DEFERRED**                |

**G7 is not claimed as passing.** It needs a provisioned host with a dedicated
IPv4, which is not reachable from a development machine. See
[M00-provisioning.md](./M00-provisioning.md) step 4. Everything the relay needs in
order to satisfy it — `Dockerfile`, `fly.toml`, `/health` — is written and
verified locally.

Lint, test, and the three gate scripts also pass: 12/12 lint, 12/12 test (12
relay assertions), brand-grep clean, mock-data-grep clean, and migration-diff
correctly no-ops until M02 creates the schema.

---

## 5. Gate proofs

G3 and G4 assert that a gate **fails**. Both were proved with a deliberate
violation, observed, then removed.

**G3 — `packages/domain/src/__gate_fixture.ts`:**

```
5:20  error  R1: `grandTotal` is money and must be bigint paisa.
             Write `1380960n` (paisa), not `13809.6`         natech/no-float-money
8:18  error  R1: parseFloat is banned. Money is bigint paisa  natech/no-float-money
11:18 error  R1: arithmetic between money `grandTotal` and the
             number literal `1.08`                           natech/no-float-money
14:32 error  R13: `formatDuration` receives a raw subtraction
             and can render a negative duration (defect V2)   natech/no-negative-duration
```

The suggested `1380960n` is the correct paisa conversion of the Appendix A.1
grand total, which is a useful sign the rule understands what it is reading.

**G4 — `packages/domain/src/__brand_fixture.ts`:** five violations, one per
identity class — trading name, NTN shape, reference address, Pakistani phone,
literal hex colour.

Also proved: §3 domain purity rejects `react` and `drizzle-orm` imports; R2
rejects a `dbRead` import inside `app/actions/`; R11 rejects a non-null assertion
in `packages/domain`.

---

## 6. Pre-flight tasks started here

§20 assigns P1, P2, P3, P5, and P6 to M00. Drafts are in
[`docs/preflight/`](../preflight/). **They have not been sent** — each is
addressed from the vendor to an authority and belongs to the owner to send. No
default blocks the build.

`docs/preflight/fbr-ip-whitelist.md` is drafted too. It is blocked on the relay
deploy and must wait for the dedicated IPv4.

---

## 7. Execution log

Findings worth carrying forward, in the order they surfaced.

1. **The repository was not a git repo.** R8 migration-diff, Husky, and
   lint-staged all need one. `git init` came first, and the build plan was renamed
   to `docs/BUILD-PLAN.md` per §0 step 2 with history preserved.

2. **TypeScript pinned to 6.0.3, not 7.0.2.** `typescript-eslint@8.67.0` caps at
   `<6.1.0`, and R11 depends on its rules.
   [ADR 0002](../decisions/0002-typescript-6-not-7.md).

3. **ESLint pinned to 9.39.5, which npm publishes as deprecated.**
   `eslint-plugin-react` has no ESLint 10 release and is a hard dependency of
   `eslint-config-next`. [ADR 0003](../decisions/0003-eslint-9-not-10.md). Revisit.

4. **The package scope was renamed from the client to the vendor.** The R12 gate
   reported 22 violations against the repository own configuration. The gate was
   right: a scope named after one client is hardcoded client identity.
   [ADR 0004](../decisions/0004-vendor-package-scope.md).

5. **`turbo run lint` deadlocked past ten minutes** while each package linted in
   about ten seconds alone. Cause: pnpm 10+ records an undecided build permission
   per dependency with a lifecycle script and prompts on every invocation, and
   twelve concurrent turbo tasks sharing one stdin never resolve. Fixed with
   `allowBuilds` in `pnpm-workspace.yaml`.

6. **The relay `/health` handler was synchronous.** Fastify ignores the return
   value of a sync handler and waits for `reply.send()`, so the route hung until
   the request timed out. The test suite caught it before it reached the gate.

7. **Two path-scoped ESLint blocks silently matched nothing.** A flat-config
   `files` pattern resolves relative to the directory of the config file that
   declares it, so `packages/domain/**/*.ts` never matched while eslint ran inside
   `packages/domain`. The §3 purity rule and the R11 strict-package rule were both
   inert. They are now named exports that each package opts into. Worth
   remembering: a lint rule matching nothing looks exactly like a lint rule passing.

8. **A `**` glob inside a block comment closes the comment.**
   `scripts/mock-data-grep.mjs` failed to parse because its own documentation
   listed glob patterns.

9. **`HARDCODED` matched ordinary prose.** The mock-data gate flagged the comment
   "the brand name is never hardcoded here". Markers are written in caps and prose
   is not, so that rule is now case-sensitive.

10. **Sentry was removed at the owner request** after being scaffolded.
    [ADR 0006](../decisions/0006-no-sentry.md).

### Local toolchain note

`corepack enable` fails on this machine with `EPERM`: it writes shims into the
Node install directory under Program Files and needs an elevated shell.
`corepack prepare pnpm@11.22.0 --activate` succeeded, so **every pnpm command in
this session ran as `corepack pnpm`**. The standalone `pnpm` on PATH is 8.15.1 and
does not match the pin. Run `corepack enable` once from an administrator shell so
that bare `pnpm` resolves to 11.22.0; until then, use `corepack pnpm`.

---

## 8. Exit

- [x] Every non-deferred gate criterion passes
- [x] G7 recorded as deferred with its blocker named
- [x] Lockfile committed
- [x] Six ADRs recording each material choice
- [x] Five pre-flight letters plus the IP-whitelisting request drafted, none sent
- [ ] **Next: M01 · design-system.** Do not start it in this session (§0 rule 4).

### Carried into later milestones

| Item                                                      | Milestone |
| --------------------------------------------------------- | --------- |
| §7.7 PERMANENT-failure escalation now has no destination  | M11       |
| §7.10 reconciliation drift alert now has no destination   | M11       |
| R10 DB CHECK constraint on `fiscal_outbox`                | M02       |
| R17 receipt-renderer snapshot test                        | M10       |
| ESLint 10 upgrade once `eslint-plugin-react` supports it  | any       |
| TypeScript 7 upgrade once `typescript-eslint` supports it | any       |
