# Deployment

Target: **GitHub Pages** (repo `swd543/pdfboogie` →
`https://swd543.github.io/pdfboogie`), deployed by GitHub Actions — no
manual artifact uploading.

## One workflow: `.github/workflows/ci.yml`

| Job | When | What it does |
|---|---|---|
| `test` | every push + PR | pnpm 11.13.1 + Node 24 → `typecheck` → `lint` (biome) → unit tests → build with `VITE_BASE=/` → `playwright install --with-deps chromium` → E2E suite against the production `dist` (served on `:8899`) |
| `deploy` | pushes to `main` | build with `VITE_BASE=/pdfboogie/` + `VITE_SITE_URL=https://swd543.github.io/pdfboogie` → `upload-pages-artifact@v3` → `deploy-pages@v4` |

Two different base paths by design: E2E serves the app from `/` (the
Playwright `baseURL`), while the live site lives under the `/pdfboogie/`
sub-path, so asset URLs, the router and the sitemap must all be built for
that sub-path.

## Manual steps (once per repo)

1. **Settings → Pages → Build and deployment → Source: `GitHub Actions`**.
   (Required; otherwise Pages won't pick up the deploy artifact.)
2. Push to `main` — the first run of `test` + `deploy` provisions the Pages
   site. Watch the `deploy` job; its `url` output is the live site.
3. Unknown URLs serve the generated `dist/404.html` (GitHub Pages' custom
   404 behavior) — no SPA fallback configuration needed, since routing is
   prerendered static files.

## Environment variables (build-time)

| Var | Default | Purpose |
|---|---|---|
| `VITE_BASE` | `/` | Asset/base path. Set to `/pdfboogie/` for Pages. |
| `VITE_SITE_URL` | `http://localhost:3000` | Absolute URL used in sitemap, robots and OG tags. |
| `VITE_ADSENSE_CLIENT` | *(unset → ads inert)* | AdSense client id, e.g. `ca-pub-…`. See [ADS](ADS.md). |

## Running locally against the production build

```sh
pnpm build && node scripts/postbuild.mjs
python3 -m http.server 8899 --directory dist   # what the E2E suite uses
```

`pnpm start` (vite preview) also works but the E2E suite pins the plain
static server so what is tested is exactly what gets deployed.

## Updating the WASM core

The Rust crate lives in `wasm/pdfcore/`. Rebuilding it is an **optional,
local** step — CI never compiles Rust: `wasm/pdfcore/pkg/` (the built
`.wasm` + JS glue) is committed, and `scripts/copy-assets.mjs` copies it
into `public/wasm/` on every build. To rebuild: install `rustup` +
`wasm-pack`, run `pnpm wasm`, commit `wasm/pdfcore/pkg/`.

## Notes

- The E2E suite needs the `dist/` build to exist (checked in
  `e2e/global-setup.ts`) and regenerates PDF fixtures when missing
  (the encrypted fixture needs Ghostscript: `apt-get install ghostscript`).
- There is no runtime environment config: the site is static. The only
  runtime difference ever is the AdSense client id, baked in at build time.
