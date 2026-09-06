# M07 · auth

**Milestone:** M07 · **Phase:** 2 — Wiring
**Plan reference:** [BUILD-PLAN.md](../BUILD-PLAN.md) §14.1, §14.2, §14.6, §5.2, §5.1, §7.9, §2 R2/R6/R7/R11/R12
**Status:** complete
**Preceding gate:** [M06](./M06-kds-storefront-ui.md) — passed, contracts frozen

---

## 1. Purpose

Phase 1 built every screen in the product against a mock viewer. M07 is the
first milestone where the answer to "who is this, and may they" comes from the
database, and it is the milestone every one after it depends on: M10 finalizes
an invoice, M11 transmits it to PRA, M12 closes a shift, and each of those has
to name an actor that a fiscal audit can hold to account six years later.

§14.2 asks for something more specific than a login. A restaurant till is a
shared device on a counter, used by four people in an hour, and the clause
splits identity in two to match: a **binding** that lasts the shift, and an
**identification** that lasts until the next idle timeout. Both halves are on
screen at all times, and the second one is what an audit row names.

---

## 2. Scope

**In:** Auth.js v5 with terminal binding · the PIN layer and its lock screen ·
§14.1 permission resolution, checked server-side · TOTP for `OWNER` and
`MANAGER`, with enrolment · the §14.2 step-up on the fiscal credentials screen ·
attempt lockout · staff administration wired to real actions · the first-owner
bootstrap (§14.6) · `auth_attempts` and a `roles.description` column.

**Out:** the KDS station token (§14.1 `KITCHEN`) — deferred to M09a, see §6 ·
storefront email OTP (§13.3, M14) · settings persistence beyond the two security
keys M07 reads · terminal CRUD (M08) · a scannable enrolment QR (M11 brings the
encoder §7.5 specifies).

---

## 3. Decisions

**The session holds the binding; a separate cookie holds the person.** §14.2's
two halves have different lifetimes — a shift and an idle timeout — so putting
both in one token would mean re-minting the session on every till action. The
Auth.js JWT carries the account that bound the terminal and which terminal it
is; a second signed cookie carries who is at the till. Locking clears the second
and leaves the first, which is exactly what "re-lock on idle" should do to a
shift that is still running.

**The credentials provider never sees a password.** Verification happens in
`lib/auth/service.ts`, which distinguishes six outcomes — wrong password,
unknown account, deactivated, no role, TOTP required, locked out — and can say
something true about each on screen. It then mints a sixty-second handoff token
that the provider exchanges for a session, minted and consumed inside one server
action and never sent to a browser. Passing the password through `authorize()`
instead would funnel six outcomes into the one error channel a beta credentials
provider offers, and answer "sorry, that didn't work" to a cashier who is
actually locked out for another twelve minutes.

**Permissions are resolved per request, never cached in the token.** One indexed
query per authorised surface, in exchange for a role change taking effect on the
subject's next action rather than at the end of a sixteen-hour shift. For the
thing that decides who may issue a fiscal document, that is the right side of
the trade.

**The lock screen asks for a name before it will take a PIN.** A PIN alone
cannot identify anybody here: PINs are stored salted, so two people who both
chose 4715 are indistinguishable without a name to check against — and making
them distinguishable would mean hashing every PIN the same way, which is how a
stolen database becomes a lookup table. Picking a face costs one tap.

**The KDF is not what protects a PIN.** §14.2 specifies four to six digits, so
the search space is at worst ten thousand and no cost parameter makes that safe.
The lockout does: five wrong PINs and the account is refused for a minute, and
the refusal covers the correct PIN too. That is why `auth_attempts` exists as a
table rather than as process memory a serverless runtime would lose.

**TOTP is implemented, not imported.** RFC 4226 and RFC 6238 both publish test
vectors, so the implementation can be proved against the standard rather than
against its own idea of itself. `packages/auth/test/totp.test.ts` runs every
published vector. A dependency here would have to be audited to the same depth
to be trusted at all. See [ADR 0009](../decisions/0009-auth-package.md).

**No middleware.** Authorisation lives in a data access layer that every page
and every action calls, because a server action is reachable by POST to the page
it was defined on and matching that to a URL pattern in middleware is guesswork.
CVE-2025-29927 was a header that skipped Next.js middleware entirely. See
[ADR 0010](../decisions/0010-no-middleware-auth.md).

**A secret is written to the account only after a code proves the app has it.**
The pending TOTP secret rides in a signed ten-minute cookie during enrolment. A
secret stored before that proof locks the holder out of the account that would
have to fix it — and on a fresh deployment that account is the owner.

**The owner bootstrap prompts; it does not ship a password.** §14.6 gives
`brand:init` the job of seeding "roles and an owner account". Roles are
reference data and live in the seed. An owner account is a credential, and a
default password in source is a default password in production, shared by every
deployment of a re-brandable product.

---

## 4. What M07 found

**The M02 role seed had drifted from the frozen contract.** Every one of the six
roles granted permission strings that are not members of `PermissionSchema` —
`tables.write`, `stations.write`, `order.write`, `shift.own`, `kds.read`,
`kds.bump`, `tax.export`. The seed was written in M02; the contracts were
written across M04–M06 and frozen at M06. A grant outside the contract resolves
to nothing while still appearing on the roles screen, which is a permission
everybody believes was given and nothing ever checks. All six were rewritten
against §14.1 and `packages/db/test/roles.test.ts` now fails on any string
outside the contract. Re-seeding reported `6 corrected`.

**The three §4 auth secrets were empty.** `AUTH_SECRET`, `ENCRYPTION_KEY`, and
`OTP_PEPPER` were all present in `.env.local` with no value —
`M00-provisioning.md` §9 says to generate them and the step was never done.
Auth.js logs `MissingSecret` and then returns `null` from `auth()`, which is
indistinguishable from "nobody is signed in": the POS would have accepted a
correct password and returned the cashier to the sign-in screen, with the only
evidence in a server log nobody reads during service. `currentBinding()` now
refuses to run without a 32-character `AUTH_SECRET`, and the provisioning
checklist gained a verification line.

**A timestamp from `execute()` is a string, not a Date.** `authAttemptHistory`
returns the time of the last failure, and the lockout policy calls `.getTime()`
on it. A mapped Drizzle select returns a `Date`; a raw aggregate returns the
driver's string. The integration test caught it as a `TypeError` inside
`lockState` — which would have fired at the exact moment somebody was guessing
PINs. Coerced at the boundary, with the reason recorded there.

**Next treats a `_`-prefixed route folder as private.** Cost one confused build
while verifying; recorded here because the next person to add an internal route
will hit it too.

---

## 5. Gate

§18 gives Phase 2 milestones no per-milestone gate sentence, so this one derives
from §14.1, §14.2, and §19.

| #   | Criterion                                                               | Verified by                          | Result   |
| --- | ----------------------------------------------------------------------- | ------------------------------------ | -------- |
| G1  | Every protected route redirects an unbound request to sign-in           | HTTP against `next start`            | **PASS** |
| G2  | A wrong password, an unknown email, and a correct one are told apart    | live server self-test                | **PASS** |
| G3  | `OWNER` without TOTP is signed in and sent to enrolment (§14.2)         | live server self-test                | **PASS** |
| G4  | The `OWNER` wildcard resolves to all 24 frozen permissions              | live server self-test, `access.test` | **PASS** |
| G5  | Five wrong PINs lock the account, and the lock refuses the correct PIN  | live server self-test                | **PASS** |
| G6  | Step-up refuses a wrong password and accepts the right one (§14.2)      | live server self-test                | **PASS** |
| G7  | Consecutive failures count from the last success, per credential kind   | `auth-attempts.test.ts` (Neon)       | **PASS** |
| G8  | Every seeded role grants only permissions the frozen contract defines   | `roles.test.ts`                      | **PASS** |
| G9  | TOTP matches RFC 4226 and RFC 6238 published vectors                    | `totp.test.ts` (16 vectors)          | **PASS** |
| G10 | A TOTP secret at rest is encrypted and refuses a tampered ciphertext    | `credentials.test.ts`                | **PASS** |
| G11 | A token minted for one purpose is refused for another                   | `access.test.ts`                     | **PASS** |
| G12 | The till shows who is identified, and says so when nobody is (§14.2)    | `auth.test.tsx`                      | **PASS** |
| G13 | The lock screen takes no PIN until a name is chosen, and never shows it | `auth.test.tsx`                      | **PASS** |
| G14 | The back office offers an auditor only what an auditor holds (§14.1)    | `auth.test.tsx`                      | **PASS** |
| G15 | R7 — an audit row for the bind, the bootstrap, and every staff change   | live check, code review              | **PASS** |
| G16 | Workspace green: typecheck, lint, test, build, gates, format            | `pnpm run ci && pnpm build`          | **PASS** |

547 tests across 13 packages. The four CI gates — brand-grep, mock-data-grep,
tax-column-grep, migration-diff — all pass.

### How the live checks were run

A temporary route handler called the verification layer inside the running Next
server, against the real Neon branch and a throwaway `OWNER` account. Server
actions cannot be driven faithfully over `curl` — the RSC payload encoding is
not a documented wire format — so this was the honest way to exercise
`service.ts` end to end rather than in a mock. The route and the account were
both removed afterwards; `users` is back to zero rows.

**Not verified:** the browser path through the sign-in form itself. The form, the
action, and everything under it are covered separately, but no test drives a
real browser. M18 brings the tooling that would.

---

## 6. Exit

- [x] All gate criteria pass
- [x] Migration `0002` committed with the schema change (R8)
- [x] `packages/contracts` untouched — the freeze holds
- [ ] **Next: M08 · menu-floor-brand**

### Carried forward

| Item                                                                                                                                                                          | Milestone        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| The KDS station token (§14.1 `KITCHEN` is "token-scoped"). The KDS still renders mocks; a token guarding mock data is theatre. It lands with the SSE wiring.                  | M09a             |
| `touchIdentityAction()` is written and unused. Every authorised till action must call it, or §14.2's timeout is absolute rather than idle.                                    | M09a, M10        |
| `CASHIER` holds `shift.close`. §14.1 scopes it to "own shift" and the frozen contract has one permission, so M12 must check that the shift belongs to the cashier closing it. | M12              |
| A scannable enrolment QR. Enrolment shows the setup key as text, which every authenticator accepts. The real encoder is the §7.5 one, version 2 at 25×25.                     | M11              |
| Terminal registration from the back office. One `PRIMARY` till is seeded so a sign-in is possible; `fbr_pos_id` is deliberately null.                                         | M08, M11         |
| The settings registry writes. M07 reads `security.idleLockSeconds` and seeds it; nothing writes a setting yet.                                                                | M08+             |
| An owner account. `users` is empty by design — run `pnpm auth:owner`, which prompts.                                                                                          | before first use |

### What the operator has to do before the POS opens

```bash
pnpm db:migrate     # 0002 — auth_attempts, roles.description
pnpm db:seed        # corrects the six roles, seeds Till 1 and the security settings
pnpm auth:owner     # prompts for name, email, password, and an optional till PIN
```

The first sign-in as that owner goes straight to two-factor setup and will go
nowhere else until it is done (§14.2).

---

## 7. Addendum — 2026-08-24, post-close correction

A review of this milestone found that "will go nowhere else until it is done"
was true of the sign-in redirect and nothing else. `signInAction` sent an
unenrolled `OWNER`/`MANAGER` to `/two-factor` exactly once; nothing re-checked
enrolment afterward, so the back button, a bookmark, or a direct navigation to
`/`, `/admin/staff`, or `/admin/fiscal-credentials` reached a fully working
till or back office — including fiscal credentials and user management —
still unenrolled. G3 as literally worded ("is signed in and sent to
enrolment") held; the stronger claim in Decision 6 and this Exit section did
not.

Fixed by adding `requireEnrolledOperator()` to `lib/auth/session.ts`: it wraps
`requireOperator()` with the §14.2 TOTP check and redirects to `/two-factor`
on every call, not only at sign-in. It now gates `(terminal)/layout.tsx`,
`admin/layout.tsx`, `requirePermissionPage()` (and so both `admin/staff` and
`admin/fiscal-credentials`), and the four staff-mutation actions
(`createStaffAction`, `updateStaffAction`, `setPinAction`, `setActiveAction`)
and `saveFiscalCredentialAction` — everywhere `requireOperator()` was the
chokepoint except the two enrolment actions themselves
(`beginTotpEnrolmentAction`, `confirmTotpEnrolmentAction`), which must stay
reachable to an unenrolled account or nothing could ever enrol it.

No gate changes as a result — G3 already passed on its literal wording, and no
other gate exercised the missing check. `packages/auth`, `packages/db`, and
`apps/pos` test suites (173 tests) and `pos` typecheck stay green.
