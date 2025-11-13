import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Don't exclude integration tests for API package
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});
