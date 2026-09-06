# ADR 0004 — package scope is the vendor, not the client

**Status:** accepted · M00 · 2026-08-23

## Context

R12 forbids hardcoding restaurant identity, and §14.5 fails CI on any occurrence
of a trading name in source. The product is re-brandable per client, one
restaurant per deployment.

M00 first used `@khizer/` as the workspace scope. The R12 gate then reported 22
violations against the repository own configuration: the ESLint plugin
namespace, every `package.json`, every tsconfig extends path. The obvious
response, adding exclusions until the gate went quiet, would have left R12
enforcing nothing.

The gate was right. A package scope named after one client is hardcoded client
identity, and the second deployment inherits it in every import statement.

## Decision

Scope every workspace package `@natech/`, after the vendor NA Technologies Ltd.
The ESLint plugin namespace is `natech`.

The repository **directory** stays `khizer-pos` per §0 step 1. A folder name is
not rendered identity; `brand-grep` strips it before testing.

## Consequences

- The R12 gate runs against the whole repository with two narrow exclusions:
  `packages/db/seeds/` per §14.5, and `scripts/brand-grep.mjs`, which necessarily
  spells out every pattern it hunts for.
- The next deployment changes database rows and a directory name. No import moves.
