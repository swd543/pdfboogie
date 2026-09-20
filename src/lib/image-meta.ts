/**
 * Image file metadata: orientation (EXIF / eXIf) and intrinsic dimensions.
 *
 * Why this exists: browsers apply EXIF orientation when drawing images, but
 * PDF viewers do not. When we embed a raw JPEG into a PDF we must know its
 * orientation (to decide fast raw-embed vs. re-encode) and its pixel size
 * (for layout math) without decoding the whole image.
 *
 * Minimal, dependency-free readers for JPEG and PNG only.
 */

/** EXIF orientation tag values (0 = unset, 1 = normal). */
export type Orientation = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface Dims {
  width: number;
  height: number;
}

const JPEG_SOI = 0xffd8;

/** Read the EXIF orientation from a JPEG file, or 0 if none/undetectable. */
export function jpegOrientation(bytes: Uint8Array): Orientation {
  if (bytes.length < 4 || ((bytes[0]! << 8) | bytes[1]!) !== JPEG_SOI) return 0;
  let offset = 2;
  while (offset + 4 < bytes.length) {
    const marker = (bytes[offset]! << 8) | bytes[offset + 1]!;
    if (marker === 0xffe1) {
      // APP1 — may contain EXIF
      return readExifOrientation(bytes.subarray(offset + 4)) || 0;
    }
    if (marker === 0xffda) return 0; // start of scan data
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (length < 2) return 0;
    offset += 2 + length;
  }
  return 0;
}

/** Read the eXIf orientation from a PNG file, or 0 if none/undetectable. */
export function pngOrientation(bytes: Uint8Array): Orientation {
  if (
    bytes.length < 16 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return 0;
  }
  let offset = 8;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      bytes[offset + 4]!,
      bytes[offset + 5]!,
      bytes[offset + 6]!,
      bytes[offset + 7]!,
    );
    const dataStart = offset + 8;
    if (type === 'eXIf')
      return readExifOrientation(bytes.subarray(dataStart, dataStart + length)) || 0;
    if (type === 'IEND') return 0;
    offset = dataStart + length + 4; // data + CRC
  }
  return 0;
}

/** Intrinsic pixel size of a JPEG, or null when it cannot be parsed. */
export function jpegDimensions(bytes: Uint8Array): Dims | null {
  if (bytes.length < 4 || ((bytes[0]! << 8) | bytes[1]!) !== JPEG_SOI) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    const marker = (bytes[offset]! << 8) | bytes[offset + 1]!;
    // SOF0..SOF3 (excluding SOF9/10 DHT etc.) carry precision + dims
    if (marker >= 0xffc0 && marker <= 0xffc3) {
      const height = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
      const width = (bytes[offset + 7]! << 8) | bytes[offset + 8]!;
      if (width > 0 && height > 0) return { width, height };
      return null;
    }
    if (marker === 0xffda) return null;
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

/** Intrinsic pixel size of a PNG (from IHDR), or null. */
export function pngDimensions(bytes: Uint8Array): Dims | null {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width === 0 || height === 0) return null;
  return { width, height };
}

/** Bit depth of a PNG (8 or 16), from IHDR — needed to know if pdf-lib can embed it. */
export function pngBitDepth(bytes: Uint8Array): number {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return 8;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint8(24);
}

/**
 * Shared EXIF parser: finds orientation tag 0x0112 in the first IFD.
 * `bytes` starts at the "Exif\0\0" (or eXIf payload) start.
 */
function readExifOrientation(bytes: Uint8Array): Orientation {
  if (bytes.length < 8) return 0;
  // "Exif\0\0"
  if (bytes[0] !== 0x45 || bytes[1] !== 0x78 || bytes[2] !== 0x69 || bytes[3] !== 0x66) return 0;
  const tiffStart = 6;
  const view = new DataView(
    bytes.buffer,
    bytes.byteOffset + tiffStart,
    bytes.byteLength - tiffStart,
  );
  if (view.byteLength < 8) return 0;
  const little = view.getUint16(0) === 0x4949; // "II"
  const get16 = (o: number) => (little ? view.getUint16(o, true) : view.getUint16(o, false));
  const get32 = (o: number) => (little ? view.getUint32(o, true) : view.getUint32(o, false));
  if (get16(2) !== 0x002a) return 0;
  const ifdOffset = get32(4);
  if (ifdOffset + 2 > view.byteLength) return 0;
  const entryCount = get16(ifdOffset);
  for (let i = 0; i < entryCount; i += 1) {
    const entry = ifdOffset + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;
    if (get16(entry) !== 0x0112) continue; // orientation tag
    const value = get16(entry + 8);
    if (value >= 1 && value <= 8) return value as Orientation;
    return 0;
  }
  return 0;
}

/**
 * True when the orientation is "normal" (1 or 0) — i.e. embedding the raw
 * bytes into a PDF will display identically to what the browser showed.
 */
export function isNormalOrientation(orientation: Orientation): boolean {
  return orientation === 0 || orientation === 1;
}

/** Quick content sniff: does this byte array start like a JPEG? */
export function isJpegBytes(bytes: Uint8Array): boolean {
  return bytes.length > 3 && ((bytes[0]! << 8) | bytes[1]!) === JPEG_SOI;
}

/** Quick content sniff: does this byte array start like a PNG? */
export function isPngBytes(bytes: Uint8Array): boolean {
  return (
    bytes.length > 7 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}
