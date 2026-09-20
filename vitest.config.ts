import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Standalone Vitest config (tests run in Node against pure logic modules;
 * the app's vite.config.ts — with the SolidStart plugin — is intentionally
 * not loaded here).
 */
const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { '~': path.resolve(rootDir, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
