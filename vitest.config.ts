import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resolveFromRoot = (relativePath: string) => path.resolve(__dirname, relativePath);

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [resolveFromRoot('frontend/src/test/setup.ts')],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['**/dist/**', '**/node_modules/**'],
    },
  },
  resolve: {
    alias: {
      '@battlescope/shared': resolveFromRoot('packages/shared/src/index.ts'),
      '@battlescope/database': resolveFromRoot('packages/database/src/index.ts'),
      '@battlescope/database/testing': resolveFromRoot('packages/database/src/testing.ts'),
    },
  },
});
