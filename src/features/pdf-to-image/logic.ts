/**
 * PDF → Image logic: render pages with PDF.js, export via canvas.
 *
 * Runs in the browser only (needs DOM canvases); the pure helpers
 * (range math, file names) are unit-tested in Node.
 */
import { canvasToJpeg, canvasToPng, canvasToWebP } from '~/lib/imaging';
import { disposePdf, pdfDocument } from '~/lib/pdfjs';
import { type ProgressFn, yieldToBrowser } from '~/lib/types';

export type ExportFormat = 'png' | 'jpeg' | 'webp';
export type DpiOption = 96 | 150 | 220 | 300;

export interface PdfToImageOptions {
  format: ExportFormat;
  /** JPEG/WebP quality, 0..1. Ignored for PNG. */
  quality: number;
  /** Output resolution in DPI (PDF base is 72). */
  dpi: DpiOption;
  /** 1-based first page to export (inclusive). */
  from?: number;
  /** 1-based last page to export (inclusive). */
  to?: number;
}

export interface ExportedImage {
  /** 1-based page number. */
  page: number;
  bytes: Uint8Array;
  mime: string;
  ext: string;
  width: number;
  height: number;
  /** Original page size in PDF points (used by strong-compress rebuilds). */
  pageWidthPt: number;
  pageHeightPt: number;
}

const MIME: Record<ExportFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export { MIME };

/** Validate/normalise a page range against the document size. */
export function resolveRange(from: number | undefined, to: number | undefined, numPages: number) {
  const clamp = (n: number) => Math.min(Math.max(1, Math.floor(n)), numPages);
  let first = clamp(from ?? 1);
  let last = clamp(to ?? numPages);
  if (last < first) [first, last] = [last, first]; // swapped input → use as-is
  return { first, last };
}

/** Suggested file name for a page export. */
export function pageFileName(base: string, page: number, ext: string, multiPage: boolean): string {
  const name = base.replace(/\.pdf$/i, '') || 'document';
  return multiPage ? `${name}-page-${String(page).padStart(3, '0')}.${ext}` : `${name}.${ext}`;
}

/**
 * Render a page range to image bytes, reporting progress per page.
 */
export async function pdfToImages(
  data: ArrayBuffer,
  options: PdfToImageOptions,
  onProgress: ProgressFn,
): Promise<ExportedImage[]> {
  if (!data || data.byteLength === 0) throw new Error('Empty file');
  const pdf = await pdfDocument(new Uint8Array(data));

  try {
    if (pdf.numPages === 0) throw new Error('This PDF has no pages');
    const { first, last } = resolveRange(options.from, options.to, pdf.numPages);

    const scale = options.dpi / 72;
    const out: ExportedImage[] = [];
    for (let page = first; page <= last; page += 1) {
      onProgress(page - first, last - first + 1, `Rendering page ${page} of ${last - first + 1}`);
      const view = await renderOnePage(pdf, page, scale, options.format, options.quality);
      out.push({
        page,
        bytes: view.bytes,
        mime: view.mime,
        ext: options.format,
        width: view.width,
        height: view.height,
        pageWidthPt: view.pageWidthPt,
        pageHeightPt: view.pageHeightPt,
      });
      await yieldToBrowser();
    }
    return out;
  } finally {
    // Release the document (frees worker memory for the next operation).
    disposePdf(pdf);
  }
}

interface RenderedPage {
  bytes: Uint8Array;
  mime: string;
  width: number;
  height: number;
  pageWidthPt: number;
  pageHeightPt: number;
}

/** Render a single page of an open document to image bytes. */
async function renderOnePage(
  pdf: import('pdfjs-dist').PDFDocumentProxy,
  pageNumber: number,
  scale: number,
  format: ExportFormat,
  quality: number,
): Promise<RenderedPage> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const base = page.getViewport({ scale: 1 });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const ctx = canvas.getContext('2d', { desynchronized: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');

  // Opaque background for lossy formats (JPEG/WebP have no alpha).
  if (format !== 'png') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  await page.render({ canvas, viewport }).promise;

  let bytes: Uint8Array;
  if (format === 'png') bytes = await canvasToPng(canvas);
  else if (format === 'jpeg') bytes = await canvasToJpeg(canvas, quality);
  else bytes = await canvasToWebP(canvas, quality);
  const mime = MIME[format];

  const { width, height } = { width: canvas.width, height: canvas.height };
  canvas.width = 0;
  canvas.height = 0; // release the backing store immediately

  return {
    bytes,
    mime,
    width,
    height,
    pageWidthPt: base.width,
    pageHeightPt: base.height,
  };
}
