# 0009 — `packages/auth`, and why the credential code is not in the app

**Status:** accepted
**Date:** 2026-08-24
**Milestone:** M07
**Supersedes:** nothing

## Context

§3 fixes the repository tree and lists seven packages. None of them is an auth
package, and §18 M07 names only "Auth.js v5, PIN layer, permissions, TOTP,
terminal binding" — all of which reads like work inside `apps/pos`.

Three callers need the same primitives, and only one of them is a React tree:

| Caller                       | Needs                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `apps/pos`                   | verify a password, verify a PIN, verify a TOTP code, resolve §14.1 permissions |
| `packages/db/seeds/owner.ts` | hash a password and a PIN for the first owner account (§14.6)                  |
| `pnpm brand:init` (§14.6)    | the same, during provisioning                                                  |

A hashing function that lives inside a Next app cannot be called by the seed
that has to populate the table it reads. The alternative — a second
implementation in the seed — is two scrypt parameter sets that drift, and the
symptom is an owner who cannot sign in with the password they just set.

## Decision

Add `packages/auth`: Node-only, framework-free, no database access, no cookies,
no redirects. It holds hashing, AES-256-GCM sealing for a TOTP secret at rest,
RFC 4226/6238 code generation and verification, §14.1 permission resolution,
HMAC-signed short-lived tokens, and the §14.2 lockout policy.

Everything request-shaped stays in `apps/pos/lib/auth`: cookies, the Auth.js
configuration, the access layer, and the server actions.

`packages/db` gains one auth-adjacent module, `src/auth-attempts.ts`, because
the "failures since the last success" query is the part of the PIN layer most
likely to be quietly wrong and this is the package with an integration suite
pointed at a real Postgres.

## Consequences

- §3's tree now has eight packages. Any future reading of §3 should treat the
  list as the packages the plan required, not as a closed set.
- `packages/db` depends on `packages/auth`, and `packages/auth` depends on
  `packages/contracts` for the frozen `PermissionSchema`. No cycle.
- The RFC test vectors in `packages/auth/test/totp.test.ts` prove the TOTP
  implementation against the standard rather than against itself, which is why
  it is implemented rather than imported.

## Alternatives considered

**Put it in `packages/domain`.** Rejected. §3 requires the tax engine to run
unchanged inside the POS service worker (§8), and `node:crypto` in that package
would break the offline path for every consumer of it.

**Put it in `apps/pos` and duplicate the hashing in the seed.** Rejected: two
scrypt parameter sets is one bug away from an owner account nobody can open.

**Import a library for TOTP.** Not unreasonable, and it was close. Implementing
RFC 6238 is about eighty lines and both RFCs publish test vectors, so the
implementation can be proved correct against the standard. A dependency here
would have to be audited to the same depth to be trusted at all.
