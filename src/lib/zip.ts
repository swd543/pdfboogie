/**
 * ZIP archive helper built on fflate (tiny, zero-dependency, WASM-free).
 * Used by pdf-to-image for multi-page exports.
 */
import { zipSync } from 'fflate';

export interface ZipEntry {
  /** Path inside the archive, e.g. "page-001.png". */
  path: string;
  data: Uint8Array;
}

/** Build a ZIP archive from entries (synchronous — call from a worker-ish
 * context or on small/medium inputs; zipping rendered pages is fast). */
export function makeZip(entries: ZipEntry[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  for (const entry of entries) {
    files[entry.path] = entry.data;
  }
  // fflate accepts a plain object keyed by archive path.
  return zipSync(files, { level: 6 });
}
