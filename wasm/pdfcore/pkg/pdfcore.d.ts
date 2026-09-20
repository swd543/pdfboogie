/* tslint:disable */
/* eslint-disable */

/**
 * Metadata about a PDF document (camelCase getters for the JS side).
 */
export class ProbeInfo {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    isEncrypted: boolean;
    pageCount: number;
    size: number;
}

/**
 * Re-save `input` with structural compression (object streams + xref
 * streams). Returns the new document bytes.
 *
 * This is lossless with respect to rendering: all content streams, images
 * and fonts are carried through unchanged.
 */
export function lossless_compress(input: Uint8Array): Uint8Array;

/**
 * Extract a little metadata for the UI without doing any work.
 */
export function probe(input: Uint8Array): ProbeInfo;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_get_probeinfo_isEncrypted: (a: number) => number;
    readonly __wbg_get_probeinfo_pageCount: (a: number) => number;
    readonly __wbg_get_probeinfo_size: (a: number) => number;
    readonly __wbg_probeinfo_free: (a: number, b: number) => void;
    readonly __wbg_set_probeinfo_isEncrypted: (a: number, b: number) => void;
    readonly __wbg_set_probeinfo_pageCount: (a: number, b: number) => void;
    readonly __wbg_set_probeinfo_size: (a: number, b: number) => void;
    readonly lossless_compress: (a: number, b: number) => [number, number, number, number];
    readonly probe: (a: number, b: number) => [number, number, number];
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
