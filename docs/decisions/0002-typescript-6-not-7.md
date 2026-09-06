# ADR 0002 — pin TypeScript 6.0.3, not 7.x

**Status:** accepted · M00 · 2026-08-23

## Context

TypeScript 7.0.2 is the current release. R11 requires strict TypeScript, zero
`any`, and zero non-null assertions in `domain`, `db`, and `fiscal`.

`no-explicit-any` and `no-non-null-assertion` are `typescript-eslint` rules.
`typescript-eslint@8.67.0`, the current stable, declares
`typescript: ">=4.8.4 <6.1.0"`. It does not support TypeScript 7.

## Decision

Pin TypeScript **6.0.3**, the newest stable release inside that range.

## Consequences

- R11 stays mechanically enforced, which is the point of M00.
- The repository is one major version behind on TypeScript.
- Revisit when `typescript-eslint` ships TypeScript 7 support. The pin is in the
  root `package.json` and each workspace `package.json`; nothing else assumes a
  version.
- Linting is not type-aware. `no-explicit-any` and `no-non-null-assertion` do not
  need type information, so R11 is unaffected. `verbatimModuleSyntax` in the
  shared tsconfig covers what `consistent-type-imports` would have.
