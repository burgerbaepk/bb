/**
 * Flat ESLint config for the three Next.js apps.
 *
 * Adds the browser globals and the Next plugin on top of the shared base.
 * The §2 rules are inherited, not restated.
 */
import globals from 'globals';
import next from 'eslint-config-next';
import base from './base.mjs';

export default [
  ...base,
  ...(Array.isArray(next) ? next : [next]),

  {
    name: 'natech/next',
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // R15 · never colour alone, is a component-level fact a linter cannot
      // see. It is enforced by the component tests in packages/ui (M01).
      'react/no-unescaped-entities': 'off',
    },
  },
];
