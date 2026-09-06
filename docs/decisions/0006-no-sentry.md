# ADR 0006 — no Sentry

**Status:** accepted · M00 · 2026-08-23

## Context

BUILD-PLAN §4 lists `SENTRY_DSN` and `SENTRY_ENVIRONMENT`, §18 M00 names Sentry
among the foundation tasks, and §7.7 requires every PERMANENT fiscal failure to
be escalated to the compliance dashboard and Sentry within one retry cycle.

M00 scaffolded `@sentry/nextjs` with guarded, DSN-inert instrumentation. The
owner then removed it from scope.

## Decision

No Sentry. The dependency, the instrumentation files, and the workspace build
decision for `@sentry/cli` are all removed.

`SENTRY_DSN` and `SENTRY_ENVIRONMENT` remain in `.env.example`, which reproduces
§4 verbatim. Strike them when §4 is amended.

## Consequences

- **§7.7 escalation is now unimplemented.** A PERMANENT fiscal failure, such as a
  rejected NTN or an invalid HS code, must still reach a human within one retry
  cycle, or an invoice silently fails to file. M11 must route it somewhere. The
  compliance dashboard (§7.10) plus the nightly reconciliation email through
  Resend covers it, and both are already required by §7.10.
- The §7.10 nightly reconciliation is specified to raise a Sentry issue on any
  drift. That clause needs an alternative destination, decided in M11.
- No error tracking on the storefront or the POS. Worth revisiting before the M19
  pilot: a seven-day parallel run with no client-side error visibility is thin.
