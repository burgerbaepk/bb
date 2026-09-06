# ADR 0003 — stay on ESLint 9.39.5

**Status:** accepted · M00 · 2026-08-23 · **revisit**

## Context

ESLint 10.9.0 is current. The initial M00 scaffold used it and every app failed
to lint:

```
TypeError: Error while loading rule 'react/display-name':
contextOrFilename.getFilename is not a function
```

`eslint-plugin-react@7.37.5`, the newest published, calls `context.getFilename()`,
which ESLint 10 removed. Its peer range is `^3 || ... || ^9.7`; there is no
ESLint 10 release. It is a hard dependency of `eslint-config-next`.

## Decision

Pin ESLint **9.39.5** across the workspace.

## Consequences

- `eslint-config-next` works, which keeps `jsx-a11y` and `react-hooks` active.
  Those matter: R15 pairs every state with an icon and a label, M01 gates on RTL
  layout, and M18 gates on axe passing in both text directions.
- **9.39.5 is published as deprecated.** The ESLint 9 line is end-of-life, so we
  are on an unsupported minor to keep the Next lint stack working.
- Revisit when `eslint-plugin-react` ships ESLint 10 support. The upgrade is a
  version bump in every `package.json`; no configuration depends on the major.
