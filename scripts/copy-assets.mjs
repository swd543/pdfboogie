/**
 * Pre-build asset copy (idempotent).
 *
 * Copies runtime assets from node_modules / the WASM build into `public/`
 * so the static host serves them from the site root:
 *
 *  - pdf.js CMaps + standard fonts (only fetched when a document needs them)
 *  - the Rust/WASM core (`wasm/pdfcore/pkg` → `public/wasm`, when built)
 *
 * Runs as `predev` and `prebuild`. Safe to run repeatedly.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const pub = join(root, 'public');

function copyIfSource(src, dest, label) {
  if (!existsSync(src)) {
    console.warn(`[copy-assets] skipping ${label} (source not found: ${src})`);
    return;
  }
  mkdirSync(pub, { recursive: true });
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, { recursive: true });
  console.log(`[copy-assets] ${label} → ${join(pub, dest.split(join).join('/'))}`);
}

// PDF.js support data
copyIfSource(join(root, 'node_modules', 'pdfjs-dist', 'cmaps'), join(pub, 'cmaps'), 'pdf.js cmaps');
copyIfSource(
  join(root, 'node_modules', 'pdfjs-dist', 'standard_fonts'),
  join(pub, 'standard_fonts'),
  'pdf.js standard fonts',
);

// Rust/WASM core (built via `pnpm wasm`; optional at build time — the app
// degrades gracefully to the JS pipeline when it is absent).
copyIfSource(join(root, 'wasm', 'pdfcore', 'pkg'), join(pub, 'wasm'), 'wasm pdfcore');
