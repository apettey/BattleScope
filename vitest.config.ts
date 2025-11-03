import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./frontend/src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['**/dist/**', '**/node_modules/**'],
    },
  },
  resolve: {
    alias: {
      '@battlescope/shared': `${process.cwd()}/packages/shared/src/index.ts`,
      '@battlescope/database': `${process.cwd()}/packages/database/src/index.ts`,
      '@battlescope/database/testing': `${process.cwd()}/packages/database/src/testing.ts`,
    },
  },
});
