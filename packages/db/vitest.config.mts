import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // Every assertion here is a round trip to Neon in Singapore.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // The constraint suite shares one counter row and one connection pool.
    fileParallelism: false,
  },
});
