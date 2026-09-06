import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // Match Next's no-op server marker when testing server rendering helpers.
      'server-only': fileURLToPath(
        new URL('./node_modules/next/dist/compiled/server-only/empty.js', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    // `lib/**` picks up the logic-level suites that sit beside the module
    // they test (M08: `lib/stations`, `lib/terminals`) rather than under
    // `test/`, which stays reserved for the component-rendering suites that
    // need `test/setup.ts`'s global action mocks.
    include: ['test/**/*.test.tsx', 'test/**/*.test.ts', 'lib/**/*.test.ts'],
    // jsdom plus user-event is slow, and several suites run in parallel. The
    // default 5s fails on interaction tests for reasons that have nothing to do
    // with what they assert.
    testTimeout: 20_000,
    // One worker per app. Turbo already runs the packages in parallel, and a
    // jsdom fork per test file on top of that exhausts the machine — the
    // failure mode is 'Failed to start forks worker', which reads like a test
    // failure and is not one.
    fileParallelism: false,
    poolOptions: { forks: { singleFork: true } },
  },
});
