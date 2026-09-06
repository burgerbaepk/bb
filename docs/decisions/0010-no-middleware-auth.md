# 0010 — authorisation in a data access layer, not in middleware

**Status:** accepted
**Date:** 2026-08-24
**Milestone:** M07
**Supersedes:** nothing

## Context

The conventional Next.js shape for "sign the user in and keep them out of the
back office" is a `middleware.ts` that reads the session cookie and rewrites or
redirects. Auth.js v5 documents it, and it is what most examples do.

§14.1 states the requirement differently: _"Check server-side on every action.
Client-side hiding is cosmetic."_ It says nothing about where the check runs,
but it is explicit about **what** is checked — an action, not a route.

Two things make the middleware shape wrong here.

**A middleware check guards a URL, not a mutation.** Every one of M09a through
M13 is a server action that finalizes an invoice, voids a check, or changes a
tax rate. A server action is reachable by POST to the page it was defined on;
matching it to a URL pattern in middleware is guesswork, and the guess is what
an attacker gets to test.

**Middleware has been the bypass.** CVE-2025-29927 was a header that skipped
Next.js middleware entirely. Any design where middleware is the only thing
between an anonymous request and a fiscal document inherits that class of bug.

## Decision

No `middleware.ts`. Authorisation lives in `apps/pos/lib/auth/session.ts` — a
data access layer that every protected surface calls:

| Function             | Answers                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `requireBinding()`   | Is a terminal bound for this shift? (§14.2, first half)          |
| `requireOperator()`  | Which account bound it, with permissions resolved now?           |
| `requireTillStaff()` | Who is at the till, within the idle window? (§14.2, second half) |
| `assertPermission()` | Does this account hold this §14.1 permission?                    |
| `requireStepUp()`    | Has the password been re-entered in the last five minutes?       |

A page calls it to decide what to render. **Every action calls it again**, and
that second call is the one that matters. A page that renders a form is not
what stops a request.

Permissions are resolved from the database on each call rather than cached in
the session token, so a role removed at 14:00 is removed at 14:00 rather than at
the end of a sixteen-hour shift.

## Consequences

- An unauthenticated request does a little work before being turned away —
  a layout renders far enough to call `redirect()`. On a till, nobody notices.
- Every new protected surface has to remember to call the layer. That is a real
  cost, and it is the reason `requirePermissionPage()` exists as one line at the
  top of a page rather than a pattern to reassemble each time.
- One indexed query per authorised surface, plus one per action. Accepted for
  the thing that decides who may issue a fiscal document.
- The redirect on an unauthenticated request is a normal 307 from the layout,
  which is what `docs/runfiles/M07-auth.md` gate G1 verifies over HTTP.

## Alternatives considered

**Middleware for an optimistic redirect, DAL for enforcement.** The Next.js
documentation's own recommendation, and defensible. Rejected for M07 because it
adds a second place that reads session state for a saving of a few milliseconds
on the unauthenticated path, and because the edge runtime cannot run
`node:crypto`, so the two would not even share a verification routine. Worth
revisiting in M18 if the redirect latency shows up in a measurement.
