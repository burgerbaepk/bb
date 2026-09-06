/**
 * Shared flat ESLint config — BUILD-PLAN.md §2.
 *
 * Every §2 rule a linter can see is switched on here. Rules that need a
 * database constraint or a rendered snapshot to be fully enforced are still
 * registered, so they begin failing the moment the code they guard exists.
 */
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import natech from './rules/index.mjs';

export const IGNORES = [
  '**/node_modules/**',
  '**/.next/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.turbo/**',
  '**/next-env.d.ts',
  'packages/db/drizzle/**',
];

/**
 * R11 — zero non-null assertions. Opted into by packages/domain, packages/db,
 * via their own eslint.config.mjs.
 *
 * These are separate exports rather than path-scoped blocks in the default
 * config because a flat-config `files` pattern is resolved relative to the
 * directory of the config file that declares it. A `packages/domain/**`
 * pattern silently matches nothing when eslint runs inside packages/domain.
 */
export const strictPackage = {
  name: 'natech/r11-strict-package',
  files: ['**/*.ts'],
  // Applied after the shared config by each package, so it would otherwise
  // override the test exemptions below. Tests assert against undefined rows on
  // purpose.
  ignores: ['**/*.test.ts', '**/*.spec.ts', '**/test/**'],
  rules: {
    '@typescript-eslint/no-non-null-assertion': 'error',
  },
};

/**
 * §3 — packages/domain imports nothing from Next, React, or Drizzle. The tax
 * engine runs unchanged inside the POS service worker; a framework import
 * there breaks the offline path (§8).
 */
export const domainPurity = {
  name: 'natech/domain-purity',
  files: ['**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['next', 'next/*', 'react', 'react-dom', 'react/*'],
            message:
              '§3: packages/domain must import no framework. The tax engine runs in the service worker.',
          },
          {
            group: ['drizzle-orm', 'drizzle-orm/*', '@natech/db', '@natech/db/*'],
            message: '§3: packages/domain is pure. Pass data in; do not reach for the database.',
          },
        ],
      },
    ],
  },
};

export default [
  { ignores: IGNORES },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    name: 'natech/base',
    files: ['**/*.{ts,tsx,mts,cts,js,mjs,cjs,jsx}'],
    plugins: { natech },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      // ---- R1 · money is bigint paisa -------------------------------------
      // The custom rule expresses R1 more precisely than a syntax selector can:
      // it understands which identifiers are money and which are not.
      'natech/no-float-money': 'error',

      // ---- R13 · never render a negative duration -------------------------
      'natech/no-negative-duration': 'error',

      // ---- §15.2 · the layout must survive dir=rtl ------------------------
      'natech/no-physical-direction': 'error',

      // ---- R11 · strict TypeScript, zero `any` ----------------------------
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // consistent-type-imports is type-aware and would require a full
      // project service for every lint run. tsconfig's verbatimModuleSyntax
      // already enforces the substance of it at compile time.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  {
    // R2 · every write goes through `dbWrite`. The HTTP driver silently no-ops
    // a multi-statement transaction, so `dbRead` in a mutation loses writes
    // without raising an error.
    name: 'natech/r2-no-dbread-in-mutations',
    files: [
      '**/actions/**/*.{ts,tsx}',
      '**/_actions/**/*.{ts,tsx}',
      '**/app/**/route.{ts,tsx}',
      '**/api/**/*.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@natech/db',
              importNames: ['dbRead'],
              message:
                'R2: `dbRead` is the HTTP driver and silently no-ops multi-statement transactions. Use `dbWrite` for every mutation.',
            },
          ],
        },
      ],
    },
  },

  {
    name: 'natech/config-and-scripts',
    files: ['**/*.config.{js,mjs,ts}', 'scripts/**/*.mjs', 'packages/config/**/*.mjs'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  {
    name: 'natech/tests',
    files: ['**/*.test.{ts,tsx}', '**/test/**/*.{ts,tsx}', '**/__tests__/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off',
      // A test that proves the R10 CHECK constraint rejects a bad row has to be
      // able to write one. The rule guards production code.
      'natech/no-check-in-outbox': 'off',
    },
  },
];
