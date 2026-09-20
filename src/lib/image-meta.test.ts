import { describe, expect, it } from 'vitest';
import {
  isJpegBytes,
  isNormalOrientation,
  isPngBytes,
  jpegDimensions,
  jpegOrientation,
  pngBitDepth,
  pngDimensions,
  pngOrientation,
} from '~/lib/image-meta';

/* ------------------------------------------------------------------ */
/* Synthetic file builders (no real fixtures needed)                    */
/* ------------------------------------------------------------------ */

/** Build a TIFF header block (little-endian) with one orientation entry. */
function tiff(orientation: number): Uint8Array {
  const b = new Uint8Array(26);
  const view = new DataView(b.buffer);
  b[0] = 0x49; // 'I'
  b[1] = 0x49; // 'I'
  view.setUint16(2, 0x002a, true);
  view.setUint32(4, 8, true); // IFD offset
  view.setUint16(8, 1, true); // entry count
  view.setUint16(10, 0x0112, true); // orientation tag
  view.setUint16(12, 3, true); // SHORT
  view.setUint32(14, 1, true); // count
  view.setUint16(18, orientation, true); // value
  // next IFD offset = 0 (already zero)
  return b;
}

/** Build a minimal JPEG with an EXIF APP1 orientation (and SOI start). */
function jpegWithExif(orientation: number): Uint8Array {
  const exif = new Uint8Array(6 + tiff(orientation).length);
  exif.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 0); // "Exif\0\0"
  exif.set(tiff(orientation), 6);
  const out = new Uint8Array(2 + 4 + exif.length + 2);
  out[0] = 0xff;
  out[1] = 0xd8; // SOI
  out[2] = 0xff;
  out[3] = 0xe1; // APP1
  const length = exif.length + 2;
  out[4] = (length >> 8) & 0xff;
  out[5] = length & 0xff;
  out.set(exif, 6);
  out[6 + exif.length] = 0xff;
  out[7 + exif.length] = 0xda; // start of scan (terminates the walk)
  return out;
}

/** Build a minimal PNG with IHDR + optional eXIf chunk. */
function png({
  width,
  height,
  bitDepth,
  orientation,
}: {
  width: number;
  height: number;
  bitDepth?: number;
  orientation?: number;
}) {
  const depth = bitDepth ?? 8;

  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = depth;
  ihdr[9] = 6; // RGBA

  const chunks: Array<{ type: string; data: Uint8Array }> = [{ type: 'IHDR', data: ihdr }];

  if (orientation !== undefined) {
    const payload = new Uint8Array(6 + tiff(orientation).length);
    payload.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 0);
    payload.set(tiff(orientation), 6);
    chunks.push({ type: 'eXIf', data: payload });
  }
  chunks.push({ type: 'IEND', data: new Uint8Array(0) });

  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let total = 8;
  for (const c of chunks) total += 8 + c.data.length + 4;
  const out = new Uint8Array(total);
  out.set(signature, 0);
  let offset = 8;
  for (const c of chunks) {
    const head = new DataView(out.buffer, offset, 8);
    head.setUint32(0, c.data.length);
    const t = new TextEncoder().encode(c.type);
    out.set(t, offset + 4);
    out.set(c.data, offset + 8);
    // CRC = 0 (the parser under test does not verify CRCs)
    offset += 8 + c.data.length + 4;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Tests                                                                */
/* ------------------------------------------------------------------ */

describe('jpegOrientation', () => {
  it('reads EXIF orientation values 1..8', () => {
    for (const o of [1, 3, 5, 6, 8] as const) {
      expect(jpegOrientation(jpegWithExif(o))).toBe(o);
    }
  });
  it('returns 0 for non-JPEG data', () => {
    expect(jpegOrientation(new TextEncoder().encode('hello'))).toBe(0);
  });
});

describe('pngOrientation', () => {
  it('reads eXIf orientation', () => {
    expect(pngOrientation(png({ width: 10, height: 10, orientation: 6 }))).toBe(6);
  });
  it('returns 0 for PNGs without eXIf', () => {
    expect(pngOrientation(png({ width: 10, height: 10 }))).toBe(0);
  });
});

describe('dimensions', () => {
  it('reads JPEG SOF dimensions', () => {
    // Craft a JPEG with a SOF0 marker carrying 640×480.
    const sof = new Uint8Array([0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03]);
    const head = new Uint8Array([0xff, 0xd8]);
    const soi = new Uint8Array(head.length + sof.length);
    soi.set(head);
    soi.set(sof, head.length);
    expect(jpegDimensions(soi)).toEqual({ width: 640, height: 480 });
  });
  it('reads PNG IHDR dimensions and bit depth', () => {
    const b = png({ width: 320, height: 240, bitDepth: 16 });
    expect(pngDimensions(b)).toEqual({ width: 320, height: 240 });
    expect(pngBitDepth(b)).toBe(16);
    expect(pngBitDepth(png({ width: 10, height: 10 }))).toBe(8);
  });
  it('returns null for invalid input', () => {
    expect(pngDimensions(new Uint8Array(4))).toBeNull();
    expect(jpegDimensions(new TextEncoder().encode('nope'))).toBeNull();
  });
});

describe('sniffing & orientation helpers', () => {
  it('isJpegBytes / isPngBytes', () => {
    expect(isJpegBytes(jpegWithExif(1))).toBe(true);
    expect(isPngBytes(png({ width: 4, height: 4 }))).toBe(true);
    expect(isJpegBytes(new TextEncoder().encode('x'))).toBe(false);
  });
  it('isNormalOrientation', () => {
    expect(isNormalOrientation(0)).toBe(true);
    expect(isNormalOrientation(1)).toBe(true);
    expect(isNormalOrientation(6)).toBe(false);
  });
});
