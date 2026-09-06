/**
 * Root ESLint config — covers the repository-level scripts only.
 * Each app, package, and service carries its own config extending
 * @natech/config/eslint/*, and `turbo run lint` runs them per workspace.
 */
import base from '@natech/config/eslint/base';

export default [
  {
    ignores: ['apps/**', 'packages/**', 'services/**', 'tooling/**', 'docs/**'],
  },
  ...base,
];
