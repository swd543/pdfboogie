import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);

export default defineConfig({
  testDir: '.',
  testMatch: /e2e\.spec\.ts$/,
  globalSetup: './global-setup.ts',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:8899',
    headless: true,
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `python3 -m http.server 8899 --directory ${path.join(root, 'dist')}`,
    url: 'http://localhost:8899/',
    reuseExistingServer: true,
    cwd: root,
    timeout: 30_000,
  },
});
