/**
 * Download helpers. Works in the browser only (guarded at call sites —
 * downloads are always user-initiated actions).
 */

/** Trigger a browser download of `bytes` under `fileName`. */
export function saveBlob(bytes: Uint8Array, fileName: string, mime: string = ''): void {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Revoke after the click has been processed by the browser.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
}

/** Turn a Blob into bytes. */
export async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}
