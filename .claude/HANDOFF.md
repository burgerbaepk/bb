# Handoff — moving this repository to another machine

**Written:** 2026-08-24, at the end of M07 · auth.
**Companion to:** [`../CLAUDE.md`](../CLAUDE.md) (project conventions) and
[`../docs/BUILD-PLAN.md`](../docs/BUILD-PLAN.md) (the source of truth).

---

## 0. Do this first, before anything else

**The three findings from M07 must be settled before M08 starts.** They are
recorded in §3 below with the state each was left in. All three were fixed
during M07; §3 says how to confirm each on the new machine and which one can
silently come undone in transit.

Then, and only then: **M08 · menu-floor-brand**.

---

## 1. Copying by USB

There is **no git remote** on this repository. The `.git` folder is the only
copy of the history, and the M07 working tree is **uncommitted**. A USB copy of
the folder is therefore the right move — but only if it includes the files git
would not give you anyway.

### Copy

Everything, **including** these, which a `git clone` would have missed:

| Path                 | Why it matters                                                                                                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.git/`              | No remote exists. This is the only copy of eight commits of history.                                                                                                                                        |
| `.env.local`         | Gitignored. The only copy of the Neon URLs, R2 keys, Resend key, and the three auth secrets.                                                                                                                |
| every untracked file | M07 is not committed: `packages/auth/`, `apps/pos/lib/`, `apps/pos/auth.ts`, `apps/pos/app/(auth)/`, `apps/pos/app/api/`, `apps/pos/types/`, the new tests, migration `0002`, three docs. Roughly 20 paths. |

### Do not copy

| Path                                                        | Why                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node_modules/` (root **and** every package)                | pnpm builds it from a content-addressed store using hardlinks and symlinks; a file copy either bloats to several GB or arrives subtly broken. It also contains Windows-native binaries — `lightningcss-win32-x64-msvc`, `esbuild` — that are wrong on any other platform. |
| `apps/*/.next/`, `.turbo/`                                  | Build output and cache. Regenerated, and stale copies cause confusing failures.                                                                                                                                                                                           |
| `*.tsbuildinfo`, `packages/domain/coverage/`                | Incremental-build and coverage artefacts.                                                                                                                                                                                                                                 |
| `services/fiscal-relay/dist/`, `tooling/print-bridge/dist/` | Compiled output; rebuilt from source.                                                                                                                                                                                                                                     |

A reasonable one-liner from the repository root, if the destination is `E:\khizer-pos`:

```bash
robocopy . E:\khizer-pos /E /XD node_modules .next .turbo dist coverage /XF *.tsbuildinfo
```

`robocopy` copies hidden directories such as `.git` by default. Verify
`E:\khizer-pos\.git` and `E:\khizer-pos\.env.local` both exist before unplugging.

> **The `.env.local` on that stick holds live credentials** — a Neon connection
> string with the password in it, R2 keys, and a Resend key. Treat the USB
> accordingly, and wipe it once the copy is verified.

### Consider committing M07 first

The working tree carries a complete, green milestone. Committing before the move
means the history is coherent on the other side and a mistake in transit is
recoverable:

```bash
git add -A && git commit -m "feat(M07): auth — terminal binding, PIN layer, permissions, TOTP"
```

Pushing to a private remote as well would remove the single-point-of-failure
entirely. That is a decision for you, not something to do silently.

---

## 2. First run on the new machine

The database is **not** on the USB. It is a Neon branch in `ap-southeast-1`
(Singapore) and both machines point at the same one, so no dump or restore is
needed — the schema and the seed data are already there.

```bash
# 1. prerequisites: Node >= 22.11, then
corepack enable && corepack prepare pnpm@11.22.0 --activate

# 2. install (NOT with CI=1 set — see CLAUDE.md, it silently no-ops)
pnpm install

# 3. confirm the environment survived the copy
#    AUTH_SECRET, ENCRYPTION_KEY and OTP_PEPPER must each be >= 32 characters
#    NEON_DATABASE_URL and NEON_DATABASE_URL_HTTP must be DIFFERENT strings (R2)

# 4. prove the workspace is green before touching anything
pnpm run ci && pnpm build

# 5. the database already has 41 tables, 6 roles and 1 terminal.
#    It has ZERO users. Nobody can sign in until:
pnpm auth:owner        # prompts for name, email, password, optional till PIN
```

The first sign-in as that owner goes straight to two-factor setup and can reach
nothing else until it is finished (§14.2).

`pnpm db:migrate` and `pnpm db:seed` are both safe to re-run and should report
nothing to do — migration `0002` is already applied and the seed is idempotent.

---

## 3. The three M07 findings

All three were **fixed during M07**. Two travel with the code; one travels only
with `.env.local`, and is the one to actually check.

### Finding 1 — the role seed had drifted from the frozen contract

Every one of the six roles granted permission strings that are not members of
`PermissionSchema`: `tables.write`, `stations.write`, `order.write`,
`shift.own`, `kds.read`, `kds.bump`, `tax.export`. The seed was written in M02;
the contracts were written across M04–M06 and frozen at M06. A grant outside the
contract resolves to nothing while still appearing on the roles screen — a
permission everyone believes was given and nothing ever checks.

**Fixed.** `packages/db/seeds/roles.ts` rewritten against §14.1;
`packages/db/test/roles.test.ts` now fails on any string outside the contract;
`pnpm db:seed` reported `6 corrected` against the live branch.

**Confirm on the new machine:**

```bash
pnpm --filter @natech/db test        # roles.test.ts must pass
pnpm db:seed                         # must report "roles  0 new, 0 corrected"
```

### Finding 2 — the three §4 auth secrets were empty ⚠️ the one that can come undone

`AUTH_SECRET`, `ENCRYPTION_KEY` and `OTP_PEPPER` were present in `.env.local`
with **no value**. `M00-provisioning.md` §9 says to generate them; the step had
never been done. Auth.js logs `MissingSecret` and then returns `null` from
`auth()`, which is indistinguishable from "nobody is signed in" — so the POS
would have accepted a correct password and returned the cashier to the sign-in
screen, with the only evidence in a server log nobody reads during service.

**Fixed**, in two parts:

- All three were generated (64 characters each) into `.env.local`. **This part
  lives only in `.env.local` and only travels if that file is on the USB.**
- `currentBinding()` in `apps/pos/lib/auth/session.ts` now refuses to run
  without a 32-character `AUTH_SECRET`, so the same omission fails loudly rather
  than silently. That part is in the code and travels with it.

**Confirm on the new machine:** the three values are non-empty and at least 32
characters long. `@natech/auth` derives every key through HKDF, so their
encoding does not matter — only their length.

> **`ENCRYPTION_KEY` must never change once anyone has enrolled TOTP.** It seals
> `users.totp_secret` at rest. Rotate it and every enrolled second factor
> becomes undecryptable, locking out exactly the owner and manager accounts that
> §14.2 requires it of. Right now `users` is empty, so there is nothing sealed
> and no risk — but from the first enrolment onward, that value is load-bearing.

### Finding 3 — a timestamp from `execute()` is a string, not a Date

`authAttemptHistory` returns the time of the last failed attempt and the lockout
policy calls `.getTime()` on it. A mapped Drizzle select returns a `Date`; a raw
aggregate over a `timestamptz` returns the driver's string. This would have
thrown a `TypeError` inside `lockState` at the exact moment somebody was
guessing PINs — that is, it would have failed open under attack.

**Fixed.** Coerced at the boundary in `packages/db/src/auth-attempts.ts`, with
the reason recorded there. `packages/db/test/auth-attempts.test.ts` is what
caught it and now guards it.

**Confirm on the new machine:** `pnpm --filter @natech/db test`. Note that the
integration suites **skip silently** when `NEON_DATABASE_URL` is unset — a green
run with no database proves nothing about this one. Check the test count: the
db package should report **37 tests**, not fewer.

---

## 4. Where the project stands

Phases 0 and 1 are complete and M07 has opened Phase 2. `pnpm run ci` is green:
547 tests across 13 packages, and all four gates pass. `pnpm build` is green for
all three apps.

**M07 delivered:** Auth.js v5 terminal binding · the §14.2 PIN layer and lock
screen · server-side §14.1 permission checks · TOTP with enrolment · the step-up
password gate on a new `/admin/fiscal-credentials` screen · attempt lockout ·
staff administration on real audited actions · `pnpm auth:owner` · migration
`0002` (`auth_attempts`, `roles.description`).

Read [`../docs/runfiles/M07-auth.md`](../docs/runfiles/M07-auth.md) for the full
account, including the gate table and seven items carried forward. The two
decisions that deviate from the plan's letter are
[ADR 0009](../docs/decisions/0009-auth-package.md) (why `packages/auth` exists,
which §3's tree does not list) and
[ADR 0010](../docs/decisions/0010-no-middleware-auth.md) (why authorisation is a
data access layer rather than middleware).

### Known gaps, beyond the three findings

- **Nobody can sign in.** `users` is empty by design. `pnpm auth:owner`.
- **The browser path through the sign-in form was never driven end to end.** The
  form, the action and everything beneath it are covered separately, and the
  server-side flow was verified against the live database, but no test drives a
  real browser. M18 brings that tooling.
- **`touchIdentityAction()` is written and unused.** Every authorised till
  action must call it or §14.2's timeout is absolute rather than idle. M09a and
  M10 own it.
- **The KDS station token is deferred to M09a.** §14.1 calls `KITCHEN`
  "token-scoped"; the KDS still renders mock data, and a token guarding mock
  data is theatre.
- **The menu seed is partial.** Items the plan names without a price are seeded
  inactive at zero. The restaurant's real price list is still needed before
  go-live — a wrong price is charged to a customer and filed with PRA.
- **`outlet_config` is empty.** It is client identity and §14.6 populates it
  from prompts in `brand:init`. M08 owns it. Until then the POS falls back to
  neutral product wording rather than a name (R12).

---

## 5. Next milestone

**M08 · menu-floor-brand** — R2 presigned uploads, the image pipeline, variants,
modifiers, drag-reorder, floor plan geometry persistence, zone backgrounds,
station CRUD, live theme editing.

Per §0: write `docs/runfiles/M08-menu-floor-brand.md` before writing any code,
and do not start it until the three findings above are confirmed settled.

M08 also inherits from M02 and M07: `outlet_config` populated by `brand:init`,
P7 zone names, P8 table capacities, P10 the station map, modifier seed data, and
terminal registration from the back office.
