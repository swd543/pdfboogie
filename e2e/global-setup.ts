/**
 * Playwright global setup:
 *  1. `dist/` must exist (run `pnpm build` first — the E2E suite runs against
 *     the real production build, including the strict CSP).
 *  2. PDF fixtures exist (generated deterministically; Ghostscript for the
 *     encrypted one).
 *  3. Fixtures are mirrored into `dist/e2e/fixtures/` so pages can fetch them
 *     same-origin (the site's CSP `connect-src 'self'` blocks cross-origin).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);

export default async function globalSetup(): Promise<void> {
  const dist = path.join(root, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    throw new Error(`dist/index.html missing — run \`pnpm build\` before \`pnpm test:e2e\``);
  }

  const fxDir = path.join(here, 'fixtures');
  if (!fs.existsSync(path.join(fxDir, 'text-1p.pdf'))) {
    execFileSync('node', ['e2e/make-fixtures.mjs'], { cwd: root, stdio: 'inherit' });
  }

  const dest = path.join(dist, 'e2e', 'fixtures');
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(fxDir)) {
    if (f.endsWith('.pdf')) fs.copyFileSync(path.join(fxDir, f), path.join(dest, f));
  }
}
