import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      reporter: ['text-summary', 'json-summary'],
      // §18 M03 — 100% branch coverage on packages/domain. The engine decides
      // what a customer pays and what is filed with PRA; an untaken branch here
      // is an unpriced path through a fiscal calculation.
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
    },
  },
});
