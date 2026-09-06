/**
 * Flat ESLint config for Node services such as `tooling/print-bridge`.
 */
import globals from 'globals';
import base from './base.mjs';

export default [
  ...base,

  {
    name: 'natech/node-service',
    files: ['**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // A relay that cannot be read in production logs is not operable. §7.9
      // requires it to log every request and response body.
      'no-console': 'off',
    },
  },
];
