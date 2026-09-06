# 0015 — remove two-factor authentication (TOTP) entirely

**Status:** accepted
**Date:** 2026-08-27
**Milestone:** post-M18 (hardening-phase request, not a numbered milestone)
**Supersedes:** the §14.2 clause "Require TOTP for OWNER and MANAGER", and the
TOTP portions of M07 (`docs/runfiles/M07-auth.md`)

## Context

§14.2 requires a TOTP second factor for `OWNER` and `MANAGER`, enforced by
`requireEnrolledOperator()` in front of both the till and the back office, and
`packages/auth`'s `totp.ts`/`secretbox.ts` implemented RFC 4226/6238 against
the published test vectors specifically so it would not need a library. This
was a deliberate, tested piece of the M07 milestone, not an accident.

The product owner asked for it removed outright, as a direct instruction
during a till review session (not a request to reconsider or narrow it) —
every staff sign-in should need only email and password, and the back office
should gate on `requireOperator()` alone.

## Decision

TOTP is gone, not disabled behind a flag. Specifically:

- **`packages/auth`**: `totp.ts` and `secretbox.ts` deleted. `requiresTotp()`
  removed from `permissions.ts`. `KeyPurpose`/`TokenPurpose` lost
  `credentials-at-rest` and `totp-enrolment`; `derivedKey()` now always reads
  `AUTH_SECRET` (`ENCRYPTION_KEY` has no caller left and is not read).
- **`apps/pos/lib/auth`**: `verifySignIn()` no longer takes a `totp` field or
  returns `TOTP_REQUIRED`/`mustEnrolTotp`. `requireEnrolledOperator()` is
  deleted; every former caller (both layouts, `staff.ts`, `fiscal.ts`,
  `floor.ts`, `menu.ts`, `branding.ts`, `stations.ts`, `terminals.ts`,
  `outlet.ts`, the reports export route) now calls `requireOperator()`
  directly — the same function minus the TOTP-enrolment redirect. The
  enrolment cookie (`setEnrolmentCookie`/`readEnrolmentCookie`/
  `clearEnrolmentCookie`) and the two enrolment actions
  (`beginTotpEnrolmentAction`/`confirmTotpEnrolmentAction`) are gone.
- **UI**: `/two-factor` route and `TwoFactorSetup` deleted.
  `SignInForm` lost the authenticator-code field. `StaffManager` lost the
  "Two-factor" column, the "missing required two-factor" summary stat, and
  the enrolment-status section on the edit sheet.
- **Data**: `users.totp_secret` dropped (migration `0003_remove_totp_secret`).
  `auth_attempt_kind`'s `'TOTP'` enum value is left in place rather than
  recreating the type to shrink it — Postgres has no `DROP VALUE`, nothing
  ever wrote that value on the live branch (`users` was empty at the time of
  this change), and an unused enum member is inert.
- **`StaffMember`** (`packages/contracts`, frozen at M06 by ADR 0008) loses
  `totpEnabled`. This is exactly the kind of post-freeze contract change §0
  says needs an ADR rather than a silent edit — recorded here rather than in
  ADR 0008 itself, which stays a record of what M06 froze.

`OTP_PEPPER` and `apps/storefront/lib/auth/otp.ts` are untouched — that is a
different feature entirely, the storefront's customer-facing one-time-passcode
login (§13.3), and shares nothing with staff TOTP beyond the letters "OTP".

## Consequences

- An `OWNER` or `MANAGER` account signs in with email and password alone.
  Nothing server-side asks for a second factor, and nothing can be configured
  to require one without re-adding the feature.
- `packages/db/seeds/owner.ts` no longer mentions two-factor in its prompt
  flow or its post-creation message; it never enrolled TOTP itself even
  before this change, so its behaviour is otherwise identical.
- `ENCRYPTION_KEY` is dead configuration. It is removed from `.env.example`;
  a value left in a deployment's own `.env.local` is harmless (nothing reads
  it) and was not touched, since that file holds live secrets this change has
  no reason to edit.
- This is a real reduction in account-takeover resistance for the two most
  privileged roles, accepted here as the product owner's explicit,
  informed choice rather than an oversight — if that judgment changes, TOTP
  can be re-added; this ADR and the deleted files' git history are the
  starting point.
