/**
 * Shared types for the PDF tool features.
 *
 * Every feature follows the same shape: a pure(-ish) `logic` module that
 * takes bytes + options + a progress callback and returns bytes, plus a
 * thin UI layer that wires it to signals and DOM. Keeping the logic free of
 * DOM/solid imports makes it unit-testable in Node.
 */

/** A file the user selected, with display metadata. */
export interface FileItem {
  id: string;
  name: string;
  size: number;
  /** MIME type reported by the browser (may be empty for some files). */
  type: string;
  file: File;
}

/** Accepted image formats, shared between UI validation and logic. */
export const IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
] as const;

export const PDF_MIME_TYPES = ['application/pdf', 'application/x-pdf'] as const;

/** Loose extension check (browsers often report empty MIME for odd files). */
export const IMAGE_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.avif',
] as const;

export const PDF_EXTENSIONS = ['.pdf'] as const;

/** Progress callback contract used by all long-running operations. */
export type ProgressFn = (done: number, total: number, label?: string) => void;

export interface ToolResult {
  /** Output bytes ready for download. */
  bytes: Uint8Array;
  /** Suggested file name for the download. */
  fileName: string;
  /** MIME type of the output. */
  mime: string;
}

export function isImageFile(file: File): boolean {
  if (file.type && (IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) return true;
  return (IMAGE_EXTENSIONS as readonly string[]).some((ext) =>
    file.name.toLowerCase().endsWith(ext),
  );
}

export function isPdfFile(file: File): boolean {
  if (file.type && (PDF_MIME_TYPES as readonly string[]).includes(file.type)) return true;
  return file.name.toLowerCase().endsWith('.pdf');
}

/** Error thrown when an operation cannot run because a subsystem is missing. */
export class CapabilityError extends Error {
  constructor(
    message: string,
    public readonly fallback?: string,
  ) {
    super(message);
    this.name = 'CapabilityError';
  }
}

/**
 * Give the event loop a turn so long synchronous sections (pdf-lib parsing,
 * wasm compression) don't freeze the UI between progress updates.
 */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    // MessageChannel (when available) is more reliable than setTimeout for
    // waking the main thread from a long task.
    if (typeof MessageChannel !== 'undefined') {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        channel.port2.close();
        resolve();
      };
      channel.port2.postMessage(null);
      return;
    }
    setTimeout(resolve, 0);
  });
}
