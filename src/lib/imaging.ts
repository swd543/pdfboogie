/**
 * Browser image pipeline.
 *
 * Everything here runs on native browser APIs (createImageBitmap +
 * OffscreenCanvas), which are SIMD-accelerated inside the browser — this is
 * our "GPU/WASM" story for the image side: no wasm needed because the
 * platform codecs (libjpeg/libwebp/libpng) are already native.
 */

/** Decode a File into an ImageBitmap with EXIF orientation applied. */
export async function fileToBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

/**
 * Encode an ImageBitmap to JPEG bytes. `quality` is 0..1.
 * White background is NOT applied here — JPEG callers that need it must
 * composite on a white canvas first (see `renderWhiteJpeg`).
 */
export async function bitmapToJpeg(bitmap: ImageBitmap, quality: number): Promise<Uint8Array> {
  const canvas = createScratchCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { desynchronized: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0);
  return canvasToJpeg(canvas, quality);
}

/** Like bitmapToJpeg but composites onto white first (JPEG has no alpha). */
export async function renderWhiteJpeg(bitmap: ImageBitmap, quality: number): Promise<Uint8Array> {
  const canvas = createScratchCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d', { desynchronized: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  return canvasToJpeg(canvas, quality);
}

/** Encode a canvas to JPEG (used for page exports and strong compression). */
export async function canvasToJpeg(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  quality: number,
): Promise<Uint8Array> {
  const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  return new Uint8Array(await blob.arrayBuffer());
}

/** Encode a canvas to PNG (lossless; used for signatures and page exports). */
export async function canvasToPng(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<Uint8Array> {
  const blob = await canvasToBlob(canvas, 'image/png');
  return new Uint8Array(await blob.arrayBuffer());
}

/** Encode a canvas to WebP (supported in Chromium & Safari; falls back to PNG). */
export async function canvasToWebP(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  quality: number,
): Promise<Uint8Array> {
  const type = (await canvasConvertsToWebP()) ? 'image/webp' : 'image/png';
  const blob = await canvasToBlob(canvas, type, type === 'image/webp' ? quality : undefined);
  return new Uint8Array(await blob.arrayBuffer());
}

let webPChecked = false;
let webPSupported = false;
async function canvasConvertsToWebP(): Promise<boolean> {
  if (webPChecked) return webPSupported;
  // Probe once with OffscreenCanvas (HTMLCanvasElement has no convertToBlob);
  // when unavailable we fall back to PNG encoding.
  if (typeof OffscreenCanvas === 'undefined') {
    webPSupported = false;
  } else {
    try {
      const probe = new OffscreenCanvas(1, 1);
      const blob = await probe.convertToBlob({ type: 'image/webp', quality: 0.5 });
      webPSupported = blob.type === 'image/webp';
    } catch {
      webPSupported = false;
    }
  }
  webPChecked = true;
  return webPSupported;
}

function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type: string,
  quality?: number,
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))),
      type,
      quality,
    );
  });
}

function createScratchCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Downscale an ImageBitmap so its longest side is `maxSide` pixels (avoids
 * multi-GB canvases on huge scans). Returns the original if already small.
 */
export async function downscaleBitmap(bitmap: ImageBitmap, maxSide: number): Promise<ImageBitmap> {
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= maxSide) return bitmap;
  const scale = maxSide / longest;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = createScratchCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return bitmap;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  return await (canvas as OffscreenCanvas)
    .convertToBlob({ type: 'image/png' })
    .then(async (blob) => createImageBitmap(await blob));
}
