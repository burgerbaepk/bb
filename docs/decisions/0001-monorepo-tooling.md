# ADR 0001 — pnpm workspaces plus Turborepo

**Status:** accepted · M00 · 2026-08-23

## Context

BUILD-PLAN §3 fixes the repository shape: three Next.js apps, seven packages, one
service, one tooling agent. §3.1 specifies pnpm and Turborepo.

`packages/domain` must be importable by the Next.js server, by the POS service
worker, and by Vitest, with identical semantics in all three (§8).

## Decision

pnpm workspaces with Turborepo 2.x. `packageManager` pins `pnpm@11.22.0`; the
lockfile is committed.

Source-only packages (`domain`, `db`, `fiscal`, `contracts`, `branding`, `ui`)
export TypeScript directly via `"main": "./src/index.ts"`, and the apps compile
them through `transpilePackages`. They have no build step.

Only `services/fiscal-relay` and `tooling/print-bridge` emit JavaScript, because
they run under Node rather than through a bundler.

## Consequences

- No stale `dist/` can drift from source, and no build ordering exists to get wrong.
- The offline path gets the same module the server does, which is the property §8
  depends on.
- pnpm 10+ requires an explicit build decision per dependency with a lifecycle
  script. Undecided entries make pnpm prompt on every invocation and deadlock
  `turbo run`, because concurrent tasks share one stdin. Decisions live in
  `pnpm-workspace.yaml` under `allowBuilds`.
