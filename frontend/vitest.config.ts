import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import rootConfig from '../vitest.config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default mergeConfig(
  rootConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: [path.resolve(__dirname, 'src/test/setup.ts')],
    },
  }),
);
