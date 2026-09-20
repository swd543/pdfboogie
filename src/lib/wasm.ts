/**
 * Loader for the Rust/WASM core (`public/wasm/pdfcore.js`, built by
 * `pnpm wasm` from `wasm/pdfcore`).
 *
 * The module is a plain same-origin ESM asset (wasm-pack `web` target), so
 * we load it with a dynamic import of the base-prefixed URL — this keeps
 * the site fully functional even when the artifact is absent (fresh clones
 * without a Rust toolchain): the loader rejects with a CapabilityError and
 * the compress tool falls back to its pure-JS pipeline.
 */
import { CapabilityError } from './types';

export interface WasmProbe {
  pageCount: number;
  isEncrypted: boolean;
  size: number;
}

/** Shape of the wasm-bindgen `web`-target module (see wasm/pdfcore). */
interface PdfcoreModule {
  lossless_compress(input: Uint8Array): Uint8Array;
  probe(input: Uint8Array): WasmProbe;
  default?: (input?: unknown) => Promise<void>;
}

let modulePromise: Promise<PdfcoreModule> | null = null;

function loadModule(): Promise<PdfcoreModule> {
  if (!modulePromise) {
    const url = `${import.meta.env.BASE_URL}wasm/pdfcore.js`;
    modulePromise = import(/* @vite-ignore */ url)
      .then((mod: PdfcoreModule) => {
        const init = mod.default;
        if (init) return init().then(() => mod);
        return mod;
      })
      .catch(() => {
        modulePromise = null;
        throw new CapabilityError(
          'The WASM PDF core is not available in this build (run "pnpm wasm" to build it).',
          'js-fallback',
        );
      });
  }
  return modulePromise;
}

/** Lossless structural re-save via the Rust core (lopdf). */
export async function wasmLosslessCompress(input: Uint8Array): Promise<Uint8Array> {
  const mod = await loadModule();
  return mod.lossless_compress(input);
}

/** Page count / encryption probe via the Rust core. */
export async function wasmProbe(input: Uint8Array): Promise<WasmProbe> {
  const mod = await loadModule();
  return mod.probe(input);
}
